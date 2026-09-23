/**
 * Minimal RTMP receiver used by integration tests and manual verification.
 * Accepts an FFmpeg publish on rtmp://127.0.0.1:1935/live/<key> and records
 * what it received.
 */
import NodeMediaServer from 'node-media-server';

export class TestRtmpReceiver {
  constructor(port = 1935) {
    this.port = port;
    this.events = [];
    this.nms = new NodeMediaServer({
      rtmp: { port, chunk_size: 60000, gop_cache: true, ping: 15, ping_timeout: 30 },
      http: false,
      logType: 0,
    });
    this.nms.on('postPublish', (session) => {
      this.events.push({ type: 'publish', path: session.streamPath, id: session.id });
    });
    this.nms.on('donePublish', (session) => {
      this.events.push({ type: 'done', path: session.streamPath, id: session.id });
    });
  }

  async start() {
    await this.nms.run();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  stop() {
    this.nms.stop();
  }

  get published() {
    return this.events.filter((e) => e.type === 'publish');
  }
}
