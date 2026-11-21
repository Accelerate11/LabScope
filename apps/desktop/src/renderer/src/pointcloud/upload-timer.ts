interface TimerExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export class UploadTimer {
  private readonly extension: TimerExtension | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  get available(): boolean { return this.extension !== null; }

  begin(): void {
    if (!this.extension || this.pending.length >= 8) return;
    this.active = this.gl.createQuery();
    if (this.active) this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, this.active);
  }

  end(): void {
    if (!this.extension || !this.active) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  poll(): { totalMs: number; samples: number } | undefined {
    if (!this.extension || !this.pending.length) return undefined;
    if (this.gl.getParameter(this.extension.GPU_DISJOINT_EXT)) {
      this.dispose();
      return undefined;
    }
    let totalMs = 0, samples = 0;
    for (const query of this.pending) {
      if (!this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) break;
      totalMs += Number(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT)) / 1e6;
      this.gl.deleteQuery(query);
      samples++;
    }
    if (samples) this.pending.splice(0, samples);
    return { totalMs, samples };
  }

  dispose(): void {
    for (const query of this.pending) this.gl.deleteQuery(query);
    this.pending.length = 0;
  }
}
