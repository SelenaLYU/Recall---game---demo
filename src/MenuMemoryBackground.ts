import Phaser from 'phaser';
import { BASE_WIDTH, BASE_HEIGHT } from './systems/Resolution';

const PIPELINE_KEY = 'MenuMemoryWater';

// 只扭曲背景纹理；菜单文字和按钮仍由普通管线绘制。
// 背景素材（1672×941）在大屏上会被放大到 ~2400+ 设备像素——在管线里加
// 轻度邻域锐化（unsharp），把放大损失的感知清晰度拉回一档（文字/按钮不受影响）。
const fragmentShader = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uMemoryTime;
uniform vec2 uTexel;
varying vec2 outTexCoord;
varying vec4 outTint;
void main () {
  float t = uMemoryTime;
  vec2 uv = outTexCoord;
  // 整张画面交替起伏：左侧向下时右侧向上，约 15 秒呼吸一轮。
  float breath = sin(t * 0.42);
  float tilt = (uv.x - 0.5) * 0.018 * breath;
  vec2 sampleUV = (uv - 0.5) * 0.985 + 0.5
  + vec2(sin(t * 0.42 + 0.8) * 0.0015, tilt);
  vec2 safeUV = clamp(sampleUV, 0.001, 0.999);
  vec4 color = texture2D(uMainSampler, safeUV);
  vec4 blur = (
    texture2D(uMainSampler, clamp(safeUV + vec2(uTexel.x, 0.0), 0.001, 0.999)) +
    texture2D(uMainSampler, clamp(safeUV - vec2(uTexel.x, 0.0), 0.001, 0.999)) +
    texture2D(uMainSampler, clamp(safeUV + vec2(0.0, uTexel.y), 0.001, 0.999)) +
    texture2D(uMainSampler, clamp(safeUV - vec2(0.0, uTexel.y), 0.001, 0.999))
  ) * 0.25;
  color.rgb += (color.rgb - blur.rgb) * 0.3;
  float light = sin(t * 0.42) * 0.006;
  color.rgb *= 1.0 + light;
  gl_FragColor = color * vec4(outTint.bgr * outTint.a, outTint.a);
}
`;

class MenuMemoryWaterPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  /** 背景纹理的 1/尺寸，锐化采样步长；由 createMenuMemoryBackground 注入 */
  texelX = 0;
  texelY = 0;

  constructor(game: Phaser.Game) {
    super({ game, fragShader: fragmentShader });
  }

  onPreRender(): void {
    this.set1f('uMemoryTime', this.game.loop.time / 1000);
    this.set2f('uTexel', this.texelX, this.texelY);
  }
}

export function createMenuMemoryBackground(scene: Phaser.Scene): void {
  const background = scene.add.image(BASE_WIDTH / 2 - 2, BASE_HEIGHT / 2, 'ui-menu-background')
    .setDisplaySize(BASE_WIDTH * 1.035, BASE_HEIGHT * 1.035)
    .setDepth(-20);

  const renderer = scene.game.renderer;
  if (renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
    let pipeline = renderer.pipelines.get(PIPELINE_KEY) as MenuMemoryWaterPipeline | null;
    if (!pipeline) {
      pipeline = new MenuMemoryWaterPipeline(scene.game);
      renderer.pipelines.add(PIPELINE_KEY, pipeline);
    }
    // 按背景纹理实际尺寸注入锐化步长（换图后自动跟随）
    pipeline.texelX = 1 / background.frame.width;
    pipeline.texelY = 1 / background.frame.height;
    background.setPipeline(PIPELINE_KEY);
  }

  // 推进很轻，只为 Canvas 模式保留呼吸感；主要运动来自整幅画的左右起伏。
  scene.tweens.add({
    targets: background,
    x: BASE_WIDTH / 2 + 2,
    scaleX: background.scaleX * 1.008,
    scaleY: background.scaleY * 1.008,
    duration: 7500,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });
}
