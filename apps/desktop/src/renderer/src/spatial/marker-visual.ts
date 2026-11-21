import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute,
  Group, Mesh, MeshBasicMaterial, Points, PointsMaterial, SphereGeometry, Sprite, SpriteMaterial,
  Vector2, Vector3, type Material, type Object3D,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { MarkerState } from './markers';

export function textLabel(text: string, height: number): Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = '32px sans-serif';
  canvas.width = Math.max(16, Math.ceil(ctx.measureText(text).width) + 16);
  canvas.height = 48;
  ctx.font = '32px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#121921';
  ctx.strokeText(text, 8, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 8, 24);
  const texture = new CanvasTexture(canvas);
  const label = new Sprite(new SpriteMaterial({ map: texture, depthWrite: false, sizeAttenuation: true }));
  label.scale.set(height * canvas.width / canvas.height, height, 1);
  return label;
}

export function disposeVisual(node: Object3D): void {
  node.removeFromParent();
  node.traverse((item) => {
    const renderable = item as Partial<{ geometry: BufferGeometry; material: Material & { map?: CanvasTexture } }>;
    if (!(item instanceof Sprite)) renderable.geometry?.dispose();
    const material = renderable.material;
    material?.map?.dispose();
    material?.dispose();
  });
}

export function directionArrow(length: number, shaftDiameter: number, headDiameter: number, headLength: number): Group {
  const result = new Group();
  const shaftLength = Math.max(0, length - headLength);
  const material = () => new MeshBasicMaterial();
  if (shaftLength) {
    const shaft = new Mesh(new CylinderGeometry(shaftDiameter / 2, shaftDiameter / 2, shaftLength, 10), material());
    shaft.rotation.z = -Math.PI / 2;
    shaft.position.x = shaftLength / 2;
    result.add(shaft);
  }
  if (headLength) {
    const head = new Mesh(new ConeGeometry(headDiameter / 2, headLength, 12), material());
    head.rotation.z = -Math.PI / 2;
    head.position.x = shaftLength + headLength / 2;
    result.add(head);
  }
  return result;
}

function build(marker: MarkerState): Object3D {
  const { type, scale, points, colors } = marker;
  if (type === 1) return new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  if (type === 2) return new Mesh(new SphereGeometry(0.5, 20, 12), new MeshBasicMaterial());
  if (type === 9) return textLabel(marker.text, scale.z);
  if (type === 0) {
    const start = points[0] ?? new Vector3();
    const direction = points.length ? points[1]!.clone().sub(start) : new Vector3(scale.x, 0, 0);
    const length = direction.length();
    const shaft = points.length ? scale.x : scale.y;
    const head = points.length ? scale.y : scale.z;
    const headLength = points.length && scale.z > 0 ? Math.min(scale.z, length) : length * 0.25;
    const arrow = directionArrow(length, shaft, head, headLength);
    arrow.position.copy(start);
    if (length) arrow.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), direction.normalize());
    return arrow;
  }
  const perPoint = colors.length > 0;
  if (type === 8) {
    const geometry = new BufferGeometry().setFromPoints(points);
    if (perPoint) geometry.setAttribute('color', new Float32BufferAttribute(colors.flatMap(([r,g,b]) => [r,g,b]), 3));
    const size = Math.max(scale.x, scale.y);
    const material = new PointsMaterial({ size, vertexColors: perPoint });
    if (size > 0 && scale.x !== scale.y) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.markerAspect = { value: new Vector2(scale.x / size, scale.y / size) };
        shader.fragmentShader = 'uniform vec2 markerAspect;\n' + shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif (any(greaterThan(abs(gl_PointCoord - vec2(0.5)), markerAspect * 0.5))) discard;',
        );
      };
    }
    const visual = new Points(geometry, material);
    visual.visible = size > 0;
    return visual;
  }
  const xyz: number[] = [], rgb: number[] = [];
  for (let i = 0; i + 1 < points.length; i += type === 5 ? 2 : 1) {
    xyz.push(...points[i]!.toArray(), ...points[i + 1]!.toArray());
    if (perPoint) rgb.push(...colors[i]!.slice(0, 3), ...colors[i + 1]!.slice(0, 3));
  }
  const geometry = new LineSegmentsGeometry();
  if (xyz.length) {
    geometry.setPositions(xyz);
    if (perPoint) geometry.setColors(rgb);
  } else {
    geometry.setPositions([0, 0, 0, 0, 0, 0]);
    geometry.instanceCount = 0;
  }
  return new LineSegments2(geometry, new LineMaterial({ linewidth: scale.x, worldUnits: true, vertexColors: perPoint }));
}

function sameGeometry(a: MarkerState, b: MarkerState): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 1 || a.type === 2) return true;
  if (!a.scale.equals(b.scale) || a.text !== b.text || a.points.length !== b.points.length || a.colors.length !== b.colors.length) return false;
  return a.points.every((point, i) => point.equals(b.points[i]!)) &&
    a.colors.every((rgba, i) => rgba.every((value, component) => value === b.colors[i]![component]));
}

export class MarkerVisual {
  readonly group = new Group();
  private shape: Object3D | undefined;
  private current: MarkerState | undefined;
  private readonly color = new Color();

  update(marker: MarkerState): void {
    if (this.current === marker) return;
    if (!this.current || !sameGeometry(this.current, marker)) {
      if (this.shape) disposeVisual(this.shape);
      this.shape = build(marker);
      this.group.add(this.shape);
    }
    const [r, g, b, a] = marker.color;
    this.color.setRGB(r, g, b);
    this.shape!.traverse((node) => {
      const material = (node as Partial<{ material: MeshBasicMaterial }>).material;
      if (!material) return;
      if (!marker.colors.length) material.color.copy(this.color);
      material.opacity = a;
      material.transparent = a < 1 || marker.type === 9;
      material.depthWrite = !material.transparent;
    });
    if (marker.type === 1 || marker.type === 2) this.shape!.scale.copy(marker.scale);
    this.current = marker;
  }

  dispose(): void { disposeVisual(this.group); }
}
