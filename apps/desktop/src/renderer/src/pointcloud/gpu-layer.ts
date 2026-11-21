import { BufferGeometry, GLBufferAttribute, Points, ShaderMaterial, Sphere, type BufferAttribute, type Scene } from 'three';
import { PointCloudProcessor, type ProcessedCloud } from './processor';

export class GpuCloud {
  readonly processor = new PointCloudProcessor();
  private readonly positionBuffer: WebGLBuffer;
  private readonly colorBuffer: WebGLBuffer;
  private readonly geometry = new BufferGeometry();
  private readonly position: GLBufferAttribute;
  private readonly color: GLBufferAttribute;
  private readonly pixelSize = { value: 2 };
  private readonly material = new ShaderMaterial({
    uniforms: { pixelSize: this.pixelSize },
    vertexShader: `
      uniform float pixelSize;
      attribute vec4 rgba;
      varying vec4 tint;
      void main() {
        tint = rgba;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = pixelSize;
      }
    `,
    fragmentShader: `
      varying vec4 tint;
      void main() {
        vec2 corner = gl_PointCoord - vec2(0.5);
        if (dot(corner, corner) > 0.25 || tint.a <= 0.0) discard;
        gl_FragColor = tint;
      }
    `,
  });
  readonly points = new Points(this.geometry, this.material);
  private capacity = 0;
  allocations = 0;
  uploads = 0;
  uploadedBytes = 0;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly scene: Scene) {
    const position = gl.createBuffer();
    const color = gl.createBuffer();
    if (!position || !color) {
      gl.deleteBuffer(position);
      gl.deleteBuffer(color);
      this.material.dispose();
      throw new Error('WebGL2 无法分配点云缓冲区');
    }
    this.positionBuffer = position;
    this.colorBuffer = color;
    this.position = new GLBufferAttribute(position, gl.FLOAT, 3, 4, 0);
    this.color = new GLBufferAttribute(color, gl.UNSIGNED_BYTE, 4, 1, 0, true);
    // Three's WebGL backend supports GLBufferAttribute. The pinned typings omit that overload.
    this.geometry.setAttribute('position', this.position as unknown as BufferAttribute);
    this.geometry.setAttribute('rgba', this.color as unknown as BufferAttribute);
    this.geometry.boundingSphere = new Sphere();
    this.geometry.setDrawRange(0, 0);
    // Bounds come from the processor. Three's automatic bounds reader requires CPU BufferAttributes.
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  get gpuBytes(): number { return this.capacity * 16; }

  upload({ drawnPoints: count, hasAlpha, bounds: { min, max } }: ProcessedCloud): void {
    const gl = this.gl;
    const { positions, colors, capacity } = this.processor;
    const grow = capacity > this.capacity;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    if (grow) gl.bufferData(gl.ARRAY_BUFFER, positions.byteLength, gl.DYNAMIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions, 0, count * 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    if (grow) gl.bufferData(gl.ARRAY_BUFFER, colors.byteLength, gl.DYNAMIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors, 0, count * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    if (grow) {
      this.capacity = capacity;
      this.position.setCount(capacity);
      this.color.setCount(capacity);
      this.allocations++;
    }
    this.uploads++;
    this.uploadedBytes += count * 16;
    this.geometry.setDrawRange(0, count);
    const sphere = this.geometry.boundingSphere!;
    sphere.center.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    sphere.radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
    this.material.transparent = hasAlpha;
    this.material.depthWrite = !hasAlpha;
  }

  setPointSize(size: number): void {
    this.pixelSize.value = size;
  }

  clear(): void {
    this.geometry.setDrawRange(0, 0);
    this.points.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    // Three releases attached buffers it has drawn. Undrawn buffers still belong to the layer.
    if (this.gl.isBuffer(this.positionBuffer)) this.gl.deleteBuffer(this.positionBuffer);
    if (this.gl.isBuffer(this.colorBuffer)) this.gl.deleteBuffer(this.colorBuffer);
  }
}
