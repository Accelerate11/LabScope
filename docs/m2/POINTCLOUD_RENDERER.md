# M2.2 点云查看器

## 使用

1. 在「实时 → 可视化工作区」展开「模拟数据」。选定场景、点数和种子。需要三路点云时勾选「三路点云」，再启动。
2. 添加 3D Viewer，将数据源设为「模拟」，话题选 `/points`。在「点云图层配置」中可叠加 `/points/structure` 和 `/points/objects`。
3. 分别设置每层的颜色、点大小、点数上限、采样和可见性。主图层跟随面板顶部的源和话题。叠加层可从实时、回放或模拟选择独立数据源。配置随工作区保存。
4. 左键拖动旋转、右键拖动平移、滚轮缩放。「聚焦点云」将当前可见点群纳入视野，「重置视角」恢复默认视角。轴和网格使用 Z 向上的点云参考系。

每层显示原始、有效和绘制点数以及消息的 `frame_id`。可选择 Fixed Frame 按采样时间转换点云。选择原坐标模式时，以首个可见、有效的图层为参考系。同一明确坐标系可叠加，其余图层提示暂停。无 frame_id 的样本最多独立显示。[TF 引擎](TF_ENGINE.md)

## 消费链路

Viewer3D 在已有 Panel Registry 内管理多话题订阅。实时、回放和模拟都消费 `MessageEnvelope`。模拟读取已有 Simulation Engine。实时 Worker 仅对面板订阅以现有遥测频率发送最新的完整 PointCloud2 样本，手动监控仍可读取 JSON 预览。回放适配器发布完整的解码对象。通过本地回环和模拟夹具验证三种入口，实际硬件接入留到 Hardware Validation。[Data Bus API](DATA_BUS_API.md)

每个图层保留最多一条待显示消息。新消息覆盖尚未处理的旧消息，更新显示侧丢弃计数。每次动画帧先验证消息的内存布局，再执行抽样和颜色计算，最后上传有改动的图层。清除总线或回放 seek 将对应图层绘制范围归零。采样和缓冲更新均使用自己的输出数组，录制端仍应从原始数据流读取完整消息。

## 渲染和资源

每个 Viewer 使用一个 Three.js 场景、一个 WebGL2 Renderer 和最多三个 `Points` 对象。每个图层使用一份 `BufferGeometry` 和两份 `GLBufferAttribute`，分别承载 Float32 XYZ 和归一化 Uint8 RGBA。图层首次分配或扩容时调用 `bufferData`，常规更新只调用 `bufferSubData`，仅写当前有效点区域。几何和 WebGLBuffer 对象跨帧复用。CPU 缓冲每个容量点占 24 字节，GPU 顶点缓冲每点占 16 字节，不含 framebuffer、着色器和驱动缓存。[Three.js GLBufferAttribute](https://threejs.org/docs/pages/GLBufferAttribute.html)

关闭图层释放订阅、几何、材质与 GPU 缓冲。图层隐藏时释放订阅并保留容量以供重新启用。关闭 Viewer 同时停止动画循环、释放相机控制、网格、坐标轴、计时查询及 WebGL 上下文。遇到上下文丢失，界面保留图层配置，可显式重试。

## 指标

界面显示 FPS、帧间隔、解码、CPU 处理、上传提交、GPU 计时查询、待显示队列、丢弃显示帧和显式缓冲容量。GPU 查询不可用、未到结果或发生 disjoint 时显示空值。Electron 测试另采集 Renderer、GPU 进程工作集和模拟生产耗时。[Khronos WebGL2 Timer Query](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/) · [性能报告](M2.2_PERFORMANCE_REPORT.md)
