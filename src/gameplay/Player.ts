import Phaser from 'phaser';
import { Effects } from './Effects';
import { Vine } from './Vine';

export type PlayerState = 'idle' | 'run' | 'jump' | 'fall';

/** Player 用到的音效接口，Sfx 模块实现；测试或静音时可注入空实现 */
export interface PlayerSfx {
  jump(): void;
  land(): void;
  step(): void;
  doubleJump(): void;
  grab(): void;
}

export interface PlayerOptions {
  x: number;
  y: number;
  /** 碰撞体尺寸 */
  width?: number;
  height?: number;
  /** 水平速度 px/s */
  speed?: number;
  /** 起跳速度（负值向上） */
  jumpVelocity?: number;
  /** 土狼时间：离地后仍可起跳的窗口 ms（Celeste 同款宽容技巧） */
  coyoteMs?: number;
  /** 跳跃缓冲：落地前按跳、落地瞬间补跳的窗口 ms */
  jumpBufferMs?: number;
  /** 最大下落速度 */
  maxFallSpeed?: number;
  /** 轻落地速度阈值（低于此值只做轻反馈） */
  softLandThreshold?: number;
  /** 重落地阈值（触发镜头微震） */
  hardLandThreshold?: number;
  sfx?: PlayerSfx;
}

/**
 * 角色控制器：输入、物理、跳跃手感与程序化占位动画。
 *
 * 画面说明：当前角色是部件拼装的小人（头/发/黄衣/背带裤/双腿），
 * 跑步摆腿、待机呼吸、空中姿势全部程序化驱动——B 的序列帧到位后，
 * 把 buildParts 换成 sprite + animation 即可，物理与手感数值不动。
 */
export class Player {
  /** 物理与视觉根节点（Container），场景对它建 collider/overlap/follow */
  readonly view: Phaser.GameObjects.Container;

  state: PlayerState = 'idle';
  facing: -1 | 1 = 1;

  private readonly scene: Phaser.Scene;
  private readonly opts: Required<Omit<PlayerOptions, 'sfx'>> & {
    sfx?: PlayerSfx;
  };
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;
  private readonly body: Phaser.Physics.Arcade.Body;

  // 程序化动画部件
  private readonly headGroup: Phaser.GameObjects.Container;
  private readonly torso: Phaser.GameObjects.Rectangle;
  private readonly legLeft: Phaser.GameObjects.Rectangle;
  private readonly legRight: Phaser.GameObjects.Rectangle;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private wasOnGround = true;
  private prevFallSpeed = 0;
  private frozen = false;
  private squashing = false;
  private runPhase = 0;
  private breatheT = 0;
  private stepTimer = 0;
  private displayedFacing: -1 | 1 = 1;
  /** 空中可用的二段跳次数（落地恢复） */
  private airJumpsLeft = 0;
  private attachedVine: Vine | null = null;

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
      softLandThreshold: 220,
      hardLandThreshold: 700,
      ...options,
    };

    // ---- 部件化占位小人（参考“鱼鱼-小黄衣”设定稿的配色） ----
    const { width, height } = this.opts;
    const headGroup = scene.add.container(0, -19);
    const backHair = scene.add.rectangle(-6, 2, 6, 13, 0x4a3628);
    const head = scene.add.circle(0, 0, 8, 0xf2d8b8).setStrokeStyle(1.5, 0xb99a72, 0.8);
    const hairCap = scene.add.rectangle(0, -5, 16.5, 8, 0x4a3628);
    const eye = scene.add.rectangle(5, 0.5, 2.5, 3.2, 0x2b2b2b);
    headGroup.add([backHair, head, hairCap, eye]);

    const torso = scene.add
      .rectangle(0, -6, 15, 20, 0xf0d98c)
      .setStrokeStyle(1.5, 0xb99a45, 0.8);
    const bib = scene.add.rectangle(0, -1, 15, 11, 0x5a7d9a);
    const legLeft = scene.add
      .rectangle(-3.5, 8, 5, 19, 0x46617a)
      .setOrigin(0.5, 0)
      .setStrokeStyle(1, 0x2f4254, 0.7);
    const legRight = scene.add
      .rectangle(3.5, 8, 5, 19, 0x46617a)
      .setOrigin(0.5, 0)
      .setStrokeStyle(1, 0x2f4254, 0.7);

    this.view = scene.add.container(options.x, options.y, [
      legLeft,
      legRight,
      torso,
      bib,
      headGroup,
    ]);
    this.headGroup = headGroup;
    this.torso = torso;
    this.legLeft = legLeft;
    this.legRight = legRight;

    scene.physics.add.existing(this.view);
    this.body = this.view.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(width, height, false);
    this.body.setOffset(-width / 2, -height / 2);
    this.body.setCollideWorldBounds(true);

    this.keys = scene.input.keyboard
      ? (scene.input.keyboard.addKeys(
          'A,D,W,S,LEFT,RIGHT,UP,DOWN,SPACE',
        ) as Record<string, Phaser.Input.Keyboard.Key>)
      : {};
  }

  update(delta: number): void {
    if (this.frozen) {
      this.body.setVelocity(0, 0);
      return;
    }

    if (this.attachedVine) {
      this.updateVineGrab(delta);
      return;
    }

    const onGround = this.body.onFloor();
    const left = this.isDown('A') || this.isDown('LEFT');
    const right = this.isDown('D') || this.isDown('RIGHT');
    const jumpHeld = this.isDown('SPACE') || this.isDown('W') || this.isDown('UP');
    const jumpPressed =
      this.justPressed('SPACE') || this.justPressed('W') || this.justPressed('UP');
    const jumpReleased =
      this.justReleased('SPACE') || this.justReleased('W') || this.justReleased('UP');

    // 土狼时间 + 跳跃缓冲（Celeste “& Forgiveness” 同款宽容技巧）
    if (onGround) {
      this.airJumpsLeft = 1;
    }
    this.coyoteTimer = onGround ? this.opts.coyoteMs : Math.max(0, this.coyoteTimer - delta);
    this.jumpBufferTimer = jumpPressed
      ? this.opts.jumpBufferMs
      : Math.max(0, this.jumpBufferTimer - delta);

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.body.setVelocityY(this.opts.jumpVelocity);
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.opts.sfx?.jump();
      Effects.dust(this.scene, this.view.x, this.view.y + this.opts.height / 2 - 2, 4, 16);
    } else if (this.jumpBufferTimer > 0 && !onGround && this.airJumpsLeft > 0) {
      // 二段跳：稍弱，空中翻滚一圈做辨识
      this.airJumpsLeft -= 1;
      this.jumpBufferTimer = 0;
      this.body.setVelocityY(this.opts.jumpVelocity * 0.92);
      this.opts.sfx?.doubleJump();
      Effects.ring(this.scene, this.view.x, this.view.y + this.opts.height / 2 - 6, 0xd8e8d0);
      this.scene.tweens.add({
        targets: this.view,
        angle: this.facing * 360,
        duration: 280,
        ease: 'Quad.easeOut',
        onComplete: () => this.view.setRotation(0),
      });
    }

    // 半重力跳跃顶点：上升末段按住跳跃时抵消一半重力，滞空更可控
    if (!onGround && jumpHeld && this.body.velocity.y < 0 && this.body.velocity.y > -180) {
      this.body.setGravityY(-700);
    } else {
      this.body.setGravityY(0);
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
    if (this.facing !== this.displayedFacing) {
      this.displayedFacing = this.facing;
      this.view.scaleX = this.facing;
    }

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

    // ---- 落地反馈：只在世界着地那一帧触发，强度随落速 ----
    if (onGround && !this.wasOnGround) {
      const feetY = this.view.y + this.opts.height / 2 - 2;
      if (this.prevFallSpeed > this.opts.hardLandThreshold) {
        this.opts.sfx?.land();
        Effects.dust(this.scene, this.view.x, feetY, 8, 34);
        this.scene.cameras.main.shake(90, 0.003);
        this.squash(1.22, 0.76);
      } else if (this.prevFallSpeed > this.opts.softLandThreshold) {
        this.opts.sfx?.land();
        Effects.dust(this.scene, this.view.x, feetY, 5, 22);
        this.squash(1.12, 0.85);
      } else {
        this.squash(1.05, 0.93);
      }
    }
    this.prevFallSpeed = onGround ? 0 : this.body.velocity.y;
    this.wasOnGround = onGround;

    this.animate(delta, onGround);
  }

  /** 进入门/演出时锁住角色：不响应输入、不受重力 */
  freeze(): void {
    this.frozen = true;
    this.attachedVine?.startCooldown(0);
    this.attachedVine = null;
    this.body.enable = true;
    this.body.setAllowGravity(false);
    this.body.setGravityY(0);
    this.body.setVelocity(0, 0);
  }

  get attached(): Vine | null {
    return this.attachedVine;
  }

  /** 抓住藤蔓：停用物理体，由藤蔓摆荡驱动位置 */
  attachVine(vine: Vine): void {
    this.attachedVine = vine;
    vine.grab(this.body.velocity.x);
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.opts.sfx?.grab();
    // 悬挂姿势：双腿微收
    this.legLeft.rotation = -0.35;
    this.legRight.rotation = -0.18;
    this.torso.rotation = 0;
    this.headGroup.y = -19;
    this.torso.y = -6;
    this.view.setRotation(0);
  }

  /** 松手甩出：按藤蔓当前摆速的切向速度 + 向上助力 */
  releaseVine(): void {
    const vine = this.attachedVine;
    if (!vine) {
      return;
    }
    const velocity = vine.releaseVelocity();
    this.attachedVine = null;
    vine.startCooldown();
    this.body.enable = true;
    this.body.setAllowGravity(true);
    this.body.setVelocity(velocity.vx, velocity.vy);
    this.wasOnGround = false;
    this.prevFallSpeed = 0;
    this.coyoteTimer = 0;
    Effects.dust(this.scene, vine.handX, vine.handY + 10, 4, 14);
  }

  /** 死亡重生：传送回重生点并清状态；钥匙等进度由场景字段保留 */
  teleportTo(x: number, y: number): void {
    this.attachedVine = null;
    this.frozen = false;
    this.body.enable = true;
    this.body.setAllowGravity(true);
    this.body.setGravityY(0);
    this.view.setScale(this.facing, 1);
    this.view.setRotation(0);
    this.view.setPosition(x, y);
    this.body.reset(x, y);
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.wasOnGround = true;
    this.prevFallSpeed = 0;
    this.squashing = false;
  }

  /** 抓藤状态：读键驱动摆荡/爬升，空格甩出 */
  private updateVineGrab(delta: number): void {
    const vine = this.attachedVine;
    if (!vine) {
      return;
    }
    const dirX =
      (this.isDown('D') || this.isDown('RIGHT') ? 1 : 0) -
      (this.isDown('A') || this.isDown('LEFT') ? 1 : 0);
    const climb =
      (this.isDown('W') || this.isDown('UP') ? 1 : 0) -
      (this.isDown('S') || this.isDown('DOWN') ? 1 : 0);
    vine.update(delta, { dirX, climb });

    // 双手挂在握点，身体垂在下方
    this.view.setPosition(vine.handX, vine.handY + 26);
    if (dirX !== 0) {
      this.facing = dirX > 0 ? 1 : -1;
      this.displayedFacing = this.facing;
      this.view.scaleX = this.facing;
    }

    if (this.justPressed('SPACE')) {
      this.releaseVine();
    }
  }

  private squash(scaleX: number, scaleY: number): void {
    this.squashing = true;
    this.view.setScale(this.facing * scaleX, scaleY);
    this.scene.tweens.add({
      targets: this.view,
      scaleX: this.facing,
      scaleY: 1,
      duration: 150,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.squashing = false;
      },
    });
  }

  /** 程序化占位动画：跑步摆腿 / 待机呼吸 / 空中姿势 / 下落伸展 */
  private animate(delta: number, onGround: boolean): void {
    const speedRatio =
      this.opts.speed === 0 ? 0 : Math.min(1, Math.abs(this.body.velocity.x) / this.opts.speed);

    if (onGround && speedRatio > 0.05) {
      this.runPhase += delta * 0.016 * speedRatio;
      this.breatheT = 0;
      const swing = Math.sin(this.runPhase);
      this.legLeft.rotation = swing * 0.75;
      this.legRight.rotation = -swing * 0.75;
      const bob = Math.abs(Math.cos(this.runPhase)) * 2;
      this.headGroup.y = -19 - bob;
      this.torso.y = -6 - bob;
      this.torso.rotation = -0.08;

      this.stepTimer -= delta;
      if (this.stepTimer <= 0) {
        this.stepTimer = 240;
        this.opts.sfx?.step();
      }
      return;
    }

    this.legLeft.rotation = 0;
    this.legRight.rotation = 0;
    this.torso.rotation = 0;
    this.stepTimer = 0;

    if (!onGround) {
      // 空中姿势：上升收前腿，下落前后打开
      if (this.body.velocity.y < 0) {
        this.legLeft.rotation = -0.55;
        this.legRight.rotation = 0.35;
      } else {
        this.legLeft.rotation = -0.15;
        this.legRight.rotation = 0.55;
      }
      this.headGroup.y = -19;
      this.torso.y = -6;
      // 随落速的纵向伸展（压扁 tween 进行中不覆盖）
      if (!this.squashing) {
        const target = 1 + Math.min(0.1, Math.max(0, this.body.velocity.y - 150) / 5500);
        this.view.scaleY += (target - this.view.scaleY) * Math.min(1, delta * 0.01);
      }
      return;
    }

    // 待机呼吸
    this.breatheT += delta;
    const breath = Math.sin(this.breatheT * 0.0035) * 1.2;
    this.headGroup.y = -19 - breath;
    this.torso.y = -6 - breath * 0.6;
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
