import { Quaternion, Vector3 } from 'three';

export type RosObject = Record<string, unknown>;

export function object(value: unknown): RosObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效 ROS 消息对象');
  return value as RosObject;
}

export function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('无效 ROS 数值');
  return value;
}

export function frameId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new Error('无效 frame_id');
  return value;
}

export function nanoseconds(value: unknown): bigint {
  const stamp = object(value);
  const sec = number(stamp.sec), nsec = number(stamp.nanosec);
  if (!Number.isInteger(sec) || sec < -2147483648 || sec > 2147483647 ||
      !Number.isInteger(nsec) || nsec < 0 || nsec >= 1e9) throw new Error('无效 ROS 时间戳');
  return BigInt(sec) * 1000000000n + BigInt(nsec);
}

export function header(value: unknown): { frame: string; time: bigint } {
  const valueObject = object(value);
  return { frame: frameId(valueObject.frame_id), time: nanoseconds(valueObject.stamp) };
}

export function vector(value: unknown): Vector3 {
  const v = object(value);
  const xyz = new Vector3(number(v.x), number(v.y), number(v.z));
  if (Math.max(Math.abs(xyz.x), Math.abs(xyz.y), Math.abs(xyz.z)) > 1e12) throw new Error('ROS 坐标超出可显示范围');
  return xyz;
}

export function quaternion(value: unknown): Quaternion {
  const q = object(value);
  const elements = [number(q.x), number(q.y), number(q.z), number(q.w)] as const;
  const length = Math.hypot(...elements);
  if (!(length > 1e-12) || !Number.isFinite(length)) throw new Error('无效四元数');
  return new Quaternion(elements[0] / length, elements[1] / length, elements[2] / length, elements[3] / length);
}

export interface RigidTransform { translation: Vector3; rotation: Quaternion }
export const identity = (): RigidTransform => ({ translation: new Vector3(), rotation: new Quaternion() });

export function compose(parent: RigidTransform, child: RigidTransform): RigidTransform {
  return {
    translation: child.translation.clone().applyQuaternion(parent.rotation).add(parent.translation),
    rotation: parent.rotation.clone().multiply(child.rotation).normalize(),
  };
}

export function inverse(transform: RigidTransform): RigidTransform {
  const rotation = transform.rotation.clone().invert();
  return { rotation, translation: transform.translation.clone().negate().applyQuaternion(rotation) };
}

export function pose(value: unknown): RigidTransform {
  const p = object(value);
  return { translation: vector(p.position), rotation: quaternion(p.orientation) };
}
