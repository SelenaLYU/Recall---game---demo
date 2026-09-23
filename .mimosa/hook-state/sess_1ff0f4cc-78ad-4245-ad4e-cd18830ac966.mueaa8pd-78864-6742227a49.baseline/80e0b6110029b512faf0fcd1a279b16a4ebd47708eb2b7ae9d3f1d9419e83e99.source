import Phaser from 'phaser';
import { BASE_WIDTH, BASE_HEIGHT } from './systems/Resolution';

const PIPELINE_KEY = 'MenuMemoryWater';

// 只扭曲背景纹理；菜单文字和按钮仍由普通管线绘制。
const fragmentShader = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uMemoryTime;
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
  vec4 color = texture2D(uMainSampler, clamp(sampleUV, 0.001, 0.999));
  float light = sin(t * 0.42) * 0.006;
  color.rgb *= 1.0 + light;
  gl_FragColor = color * vec4(outTint.bgr * outTint.a, outTint.a);
}
`;

class MenuMemoryWaterPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  constructor(game: Phaser.Game) {
    super({ game, fragShader: fragmentShader });
  }

  onPreRender(): void {
    this.set1f('uMemoryTime', this.game.loop.time / 1000);
  }
}

export function createMenuMemoryBackground(scene: Phaser.Scene): void {
  const background = scene.add.image(BASE_WIDTH / 2 - 2, BASE_HEIGHT / 2, 'ui-menu-background')
    .setDisplaySize(BASE_WIDTH * 1.035, BASE_HEIGHT * 1.035)
    .setDepth(-20);

  const renderer = scene.game.renderer;
  if (renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
    if (!renderer.pipelines.has(PIPELINE_KEY)) {
      renderer.pipelines.add(PIPELINE_KEY, new MenuMemoryWaterPipeline(scene.game));
    }
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
