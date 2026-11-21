import { Box3, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { defaultCamera, viewPresets, type CameraState, type Projection, type ViewPreset } from './camera-state';

export class CameraController {
  private readonly perspective = new PerspectiveCamera(53, 1, 0.05, 10000);
  private readonly orthographic = new OrthographicCamera(-1, 1, 1, -1, 0.01, 10000);
  private readonly controls: OrbitControls;
  private aspect = 1;
  private scale = defaultCamera.scale;
  private projection: Projection = 'perspective';
  private notifyTimer: number | undefined;
  private extent = 1;
  private readonly fov = 53 * Math.PI / 360;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly bounds: () => Box3,
    private readonly onChange: (state: CameraState) => void) {
    for (const camera of [this.perspective, this.orthographic]) camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.perspective, canvas);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.01;
    this.controls.maxDistance = 1e9;
    this.controls.minZoom = 0.0001;
    this.controls.maxZoom = 10000;
    this.restore(defaultCamera);
    this.controls.addEventListener('change', this.scheduleSave);
    this.controls.listenToKeyEvents(canvas);
    canvas.tabIndex = 0;
    canvas.addEventListener('keydown', this.key);
    canvas.addEventListener('dblclick', this.focus);
    canvas.addEventListener('pointerdown', this.focusCanvas);
  }

  get camera(): PerspectiveCamera | OrthographicCamera {
    return this.projection === 'perspective' ? this.perspective : this.orthographic;
  }

  state(): CameraState {
    return { projection: this.projection, position: this.camera.position.toArray(), target: this.controls.target.toArray(),
      scale: this.scale / this.orthographic.zoom };
  }

  restore(state: CameraState): void {
    this.projection = state.projection;
    this.controls.object = this.camera;
    this.controls.target.fromArray(state.target);
    this.camera.position.fromArray(state.position);
    this.scale = state.scale;
    this.orthographic.zoom = 1;
    this.resize(this.aspect);
    this.controls.update();
  }

  resize(aspect: number): void {
    this.aspect = aspect;
    this.perspective.aspect = aspect;
    this.perspective.updateProjectionMatrix();
    this.orthographic.left = -this.scale * aspect;
    this.orthographic.right = this.scale * aspect;
    this.orthographic.top = this.scale;
    this.orthographic.bottom = -this.scale;
    this.orthographic.updateProjectionMatrix();
  }

  reset = (): void => {
    this.restore(defaultCamera);
    this.scheduleSave();
  };

  select(projection: Projection): void {
    if (projection === this.projection) return;
    const current = this.state();
    const distance = this.camera.position.distanceTo(this.controls.target);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const nextDistance = projection === 'perspective' ? current.scale / Math.tan(this.fov) : distance;
    this.restore({ ...current, projection,
      position: direction.multiplyScalar(nextDistance).add(this.controls.target).toArray(),
      scale: projection === 'orthographic' ? distance * Math.tan(this.fov) : current.scale });
    this.scheduleSave();
  }

  preset(view: ViewPreset): void {
    const distance = this.camera.position.distanceTo(this.controls.target);
    this.camera.position.copy(this.controls.target).addScaledVector(new Vector3(...viewPresets[view]).normalize(), distance);
    this.controls.update();
    this.scheduleSave();
  }

  focus = (): void => {
    const box = this.bounds();
    if (box.isEmpty()) return;
    const center = box.getCenter(new Vector3());
    const radius = Math.max(0.1, box.getSize(new Vector3()).length() / 2);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.extent = radius;
    this.controls.target.copy(center);
    const halfAngle = Math.min(this.fov, Math.atan(Math.tan(this.fov) * this.aspect));
    this.camera.position.copy(center).addScaledVector(direction, radius / Math.sin(halfAngle) * 1.06);
    if (this.projection === 'orthographic') {
      this.scale = radius * 1.06 / Math.min(1, this.aspect);
      this.orthographic.zoom = 1;
      this.resize(this.aspect);
    }
    this.update();
    this.scheduleSave();
  };

  update(): void {
    this.controls.update();
    const far = Math.max(1000, 2 * this.camera.position.distanceTo(this.controls.target) + 4 * this.extent);
    if (far > this.camera.far) {
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  private scheduleSave = (): void => {
    clearTimeout(this.notifyTimer);
    this.notifyTimer = window.setTimeout(() => this.onChange(this.state()), 180);
  };

  private focusCanvas = (): void => this.canvas.focus({ preventScroll: true });

  private key = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const preset = Object.keys(viewPresets)[Number(event.key) - 1] as ViewPreset | undefined;
    if (preset) this.preset(preset);
    else if (event.key.toLowerCase() === 'f') this.focus();
    else if (event.key.toLowerCase() === 'r') this.reset();
    else if (event.key.toLowerCase() === 'p') this.select(this.projection === 'perspective' ? 'orthographic' : 'perspective');
    else return;
    event.preventDefault();
  };

  dispose(): void {
    clearTimeout(this.notifyTimer);
    this.controls.dispose();
    this.canvas.removeEventListener('keydown', this.key);
    this.canvas.removeEventListener('dblclick', this.focus);
    this.canvas.removeEventListener('pointerdown', this.focusCanvas);
  }
}
