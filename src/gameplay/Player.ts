import Phaser from 'phaser';

export type PlayerState = 'idle' | 'run' | 'jump' | 'fall';

export interface PlayerOptions {
  x: number;
  y: number;
  /** 碰撞体尺寸（占位贴图同尺寸加 2px 描边余量） */
  width?: number;
  height?: number;
  /** 水平速度 px/s */
  speed?: number;
  /** 起跳速度（负值向上） */
  jumpVelocity?: number;
  /** 土狼时间：离地后仍可起跳的窗口 ms */
  coyoteMs?: number;
  /** 跳跃缓冲：落地前按跳、落地瞬间补跳的窗口 ms */
  jumpBufferMs?: number;
  /** 最大下落速度 */
  maxFallSpeed?: number;
}

const TEXTURE_KEY = 'placeholder-player';

/**
 * 角色控制器：输入、物理与跳跃手感。
 * 场景在自己的 update() 里调用 player.update(delta) 驱动。
 * 美术到位后把 TEXTURE_KEY 换成正式序列帧/动画即可，数值不用动（见 AGENTS.md 素材清单）。
 */
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;

  state: PlayerState = 'idle';
  facing: -1 | 1 = 1;

  private readonly scene: Phaser.Scene;
  private readonly opts: Required<PlayerOptions>;
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;
  private readonly body: Phaser.Physics.Arcade.Body;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private wasOnGround = true;
  private frozen = false;

  constructor(scene: Phaser.Scene, options: PlayerOptions) {
    this.scene = scene;
    this.opts = {
      width: 28,
      height: 60,
      speed: 240,
      jumpVelocity: -620,
      coyoteMs: 100,
      jumpBufferMs: 120,
      maxFallSpeed: 900,
      ...options,
    };

    this.ensurePlaceholderTexture();
    this.sprite = scene.physics.add.sprite(this.opts.x, this.opts.y, TEXTURE_KEY);
    this.sprite.setCollideWorldBounds(true);
    this.body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(this.opts.width, this.opts.height, true);

    this.keys = scene.input.keyboard
      ? (scene.input.keyboard.addKeys('A,D,W,LEFT,RIGHT,UP,SPACE') as Record<
          string,
          Phaser.Input.Keyboard.Key
        >)
      : {};
  }

  update(delta: number): void {
    if (this.frozen) {
      this.body.setVelocity(0, 0);
      return;
    }

    const onGround = this.body.onFloor();
    const left = this.isDown('A') || this.isDown('LEFT');
    const right = this.isDown('D') || this.isDown('RIGHT');
    const jumpPressed =
      this.justPressed('SPACE') || this.justPressed('W') || this.justPressed('UP');
    const jumpReleased =
      this.justReleased('SPACE') || this.justReleased('W') || this.justReleased('UP');

    this.coyoteTimer = onGround ? this.opts.coyoteMs : Math.max(0, this.coyoteTimer - delta);
    this.jumpBufferTimer = jumpPressed
      ? this.opts.jumpBufferMs
      : Math.max(0, this.jumpBufferTimer - delta);

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.body.setVelocityY(this.opts.jumpVelocity);
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
    }

    // 提前松键截断上升，形成轻重两档跳高
    if (jumpReleased && this.body.velocity.y < 0) {
      this.body.setVelocityY(this.body.velocity.y * 0.45);
    }

    this.body.setVelocityX(right ? this.opts.speed : left ? -this.opts.speed : 0);
    if (right) {
      this.facing = 1;
    } else if (left) {
      this.facing = -1;
    }
    this.sprite.setFlipX(this.facing === -1);

    if (this.body.velocity.y > this.opts.maxFallSpeed) {
      this.body.setVelocityY(this.opts.maxFallSpeed);
    }

    this.state = !onGround
      ? this.body.velocity.y < 0
        ? 'jump'
        : 'fall'
      : this.body.velocity.x !== 0
        ? 'run'
        : 'idle';

    // 落地轻微压扁再弹回，低成本落地反馈
    if (onGround && !this.wasOnGround) {
      this.sprite.setScale(1.18, 0.82);
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: 1,
        scaleY: 1,
        duration: 140,
        ease: 'Quad.easeOut',
      });
    }
    this.wasOnGround = onGround;
  }

  /** 进入门/演出时锁住角色：不再响应输入、不受重力 */
  freeze(): void {
    this.frozen = true;
    this.body.setAllowGravity(false);
    this.body.setVelocity(0, 0);
  }

  private ensurePlaceholderTexture(): void {
    if (this.scene.textures.exists(TEXTURE_KEY)) {
      return;
    }
    const { width, height } = this.opts;
    const g = this.scene.add.graphics();
    g.fillStyle(0xe6cf97, 1);
    g.fillRect(2, 2, width, height);
    g.lineStyle(2, 0x8a6d3b, 1);
    g.strokeRect(2, 2, width, height);
    // 朝向标记（右眼），flipX 时自动镜像
    g.fillStyle(0x17382b, 1);
    g.fillRect(width - 7, 12, 5, 6);
    g.generateTexture(TEXTURE_KEY, width + 4, height + 4);
    g.destroy();
  }

  private isDown(name: string): boolean {
    return this.keys[name]?.isDown ?? false;
  }

  private justPressed(name: string): boolean {
    const key = this.keys[name];
    return key ? Phaser.Input.Keyboard.JustDown(key) : false;
  }

  private justReleased(name: string): boolean {
    const key = this.keys[name];
    return key ? Phaser.Input.Keyboard.JustUp(key) : false;
  }
}
