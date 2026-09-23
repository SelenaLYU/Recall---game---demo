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
 * 动画序列帧配置：B 交付的鱼鱼序列帧（Issue #4 规格：96×112 单帧、横向排布、朝右）。
 * 场景负责在 preload() 里 load.spritesheet，这里负责建动画并按状态切换。
 */
/** 空中动画为速度驱动逐帧（见 animate），只保留待机/跑步循环动画 */
const ANIM_DEFS = [
  { key: 'yuyu-idle', texture: 'char-yuyu-idle', end: 3, frameRate: 5, repeat: -1 },
  { key: 'yuyu-run', texture: 'char-yuyu-run', end: 7, frameRate: 13, repeat: -1 },
] as const;

/**
 * 序列帧单帧 96×112，缩放后角色视觉高约 81px（碰撞体 28×60，头/脚略溢出盒属正常，
 * 碰撞盒小于视觉对玩家更友好）。0.6 时角色偏小不易辨认，0.72 兼顾辨识度与碰撞准度。
 */
const SPRITE_SCALE = 0.72;
/** 序列帧底部透明边距（实测约 5 源像素），精灵下移让它踩进草皮而不是悬空 */
const FOOT_PADDING_PX = 5;

/**
 * 角色控制器：输入、物理与跳跃手感。
 * 画面为 B 的正式序列帧（Issue #4 到货接入）：idle/run/jump/fall 按状态切换；
 * 物理/手感数值与动画解耦，调参只动下面的常量。
 */
export class Player {
  /** 物理与视觉根节点（Container），场景对它建 collider/overlap/follow */
  readonly view: Phaser.GameObjects.Container;

  state: PlayerState = 'idle';
  facing: -1 | 1 = 1;

  // —— 移动模型常量（调手感改这里）——
  /** 地面/空中加速 px/s² */
  private static readonly ACCEL_GROUND = 2600;
  private static readonly ACCEL_AIR = 1900;
  /** 无输入时地面/空中减速 px/s² */
  private static readonly DECEL_GROUND = 3000;
  private static readonly DECEL_AIR = 1400;
  /** 急转变向的额外减速倍率 */
  private static readonly TURN_BOOST = 1.8;
  /** 下落加重（叠加在世界重力上，共 1.6×），跳跃弧线更漂亮 */
  private static readonly FALL_GRAVITY_EXTRA = 840;
  private static readonly SKID_DUST_MS = 320;
  /** 跑步脚步声间隔（与 run 动画步频对齐） */
  private static readonly STEP_INTERVAL_MS = 280;

  private readonly scene: Phaser.Scene;
  private readonly opts: Required<Omit<PlayerOptions, 'sfx'>> & {
    sfx?: PlayerSfx;
  };
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;
  private readonly body: Phaser.Physics.Arcade.Body;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private wasOnGround = true;
  private prevFallSpeed = 0;
  private frozen = false;
  private squashing = false;
  private stepTimer = 0;
  private skidDustAt = 0;
  private displayedFacing: -1 | 1 = 1;
  private currentAnim = '';
  /** 地面动画滞回：避免减速经过阈值时 run/idle 高频互切（“频繁动作切换”修复） */
  private groundAnim: 'yuyu-idle' | 'yuyu-run' = 'yuyu-idle';
  private groundAnimSince = 0;
  /** 空中动画死区：顶点附近 vy≈0 时保持上一状态，避免 jump/fall 抖动 */
  private airAnim: 'yuyu-jump' | 'yuyu-fall' = 'yuyu-jump';
  /**
   * 空中姿势平滑进度：速度直接映射 4 帧会在速度骤变时跳过中间姿势
   * （“动作跳帧”），对进度做低通滤波后帧序号只会逐步推进
   */
  private airPose = 0;
  private prevAirAnim: 'yuyu-jump' | 'yuyu-fall' = 'yuyu-jump';
  /** 最近一次踩到的地面高度：用于接触阴影随离地高度淡化 */
  private lastGroundY = 0;
  /** 自动走位目标（房间点击物件后走近），到达即回调 */
  private autoWalkTarget: number | null = null;
  private autoWalkDone: (() => void) | null = null;
  /** 本次起跳的初速度，用于把跳跃序列帧按速度进度映射 */
  private jumpLaunchVy = -620;
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
      coyoteMs: 120,
      jumpBufferMs: 140,
      maxFallSpeed: 1000,
      softLandThreshold: 220,
      hardLandThreshold: 700,
      ...options,
    };

    this.createAnims();

    // 脚下软阴影：贴着脚底位置（与精灵底部对齐），落地实、空中淡
    this.shadow = scene.add.ellipse(0, this.opts.height / 2 + FOOT_PADDING_PX * SPRITE_SCALE, 24, 7, 0x0b170f, 0.28);
    // 序列帧角色：origin 底部中心；再下移底部透明边距，让脚真实踩在草皮上
    this.sprite = scene.add.sprite(0, this.opts.height / 2 + FOOT_PADDING_PX * SPRITE_SCALE, 'char-yuyu-idle', 0);
    this.sprite.setOrigin(0.5, 1).setScale(SPRITE_SCALE);

    this.view = scene.add.container(options.x, options.y, [this.shadow, this.sprite]);

    scene.physics.add.existing(this.view);
    this.body = this.view.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(this.opts.width, this.opts.height, false);
    this.body.setOffset(-this.opts.width / 2, -this.opts.height / 2);
    this.body.setCollideWorldBounds(true);

    this.keys = scene.input.keyboard
      ? (scene.input.keyboard.addKeys(
          'A,D,W,S,LEFT,RIGHT,UP,DOWN,SPACE',
        ) as Record<string, Phaser.Input.Keyboard.Key>)
      : {};
  }

  /** 全局动画只建一次；重复进场景不重建 */
  private createAnims(): void {
    if (this.scene.anims.exists('yuyu-idle')) {
      return;
    }
    for (const def of ANIM_DEFS) {
      this.scene.anims.create({
        key: def.key,
        frames: this.scene.anims.generateFrameNumbers(def.texture, { start: 0, end: def.end }),
        frameRate: def.frameRate,
        repeat: def.repeat,
      });
    }
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
      this.jumpLaunchVy = this.opts.jumpVelocity;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.opts.sfx?.jump();
      this.squash(0.88, 1.14);
      Effects.dust(this.scene, this.view.x, this.view.y + this.opts.height / 2 - 2, 4, 16);
    } else if (this.jumpBufferTimer > 0 && !onGround && this.airJumpsLeft > 0) {
      // 二段跳：稍弱，空中翻滚一圈做辨识
      this.airJumpsLeft -= 1;
      this.jumpBufferTimer = 0;
      this.body.setVelocityY(this.opts.jumpVelocity * 0.92);
      this.jumpLaunchVy = this.opts.jumpVelocity * 0.92;
      this.opts.sfx?.doubleJump();
      this.squash(0.9, 1.12);
      Effects.ring(this.scene, this.view.x, this.view.y + this.opts.height / 2 - 6, 0xd8e8d0);
      // 翻滚 tween 挂在 sprite（而非 view）：避免被 squash 的 killTweensOf(view)
      // 中途杀掉、停在半途角度造成“卡死”在倾斜姿势（实测修复）
      this.scene.tweens.add({
        targets: this.sprite,
        angle: this.facing * 360,
        duration: 280,
        ease: 'Quad.easeOut',
        onComplete: () => this.sprite.setRotation(0),
      });
    }

    // 分段重力：半重力顶点（按住跳跃滞空更可控）+ 下落加重（弧线漂亮、落地更沉）
    let extraGravity = 0;
    if (!onGround) {
      if (jumpHeld && this.body.velocity.y < 0 && this.body.velocity.y > -180) {
        extraGravity = -700;
      } else if (this.body.velocity.y > 120) {
        extraGravity = Player.FALL_GRAVITY_EXTRA;
      }
    }
    this.body.setGravityY(extraGravity);

    // 提前松键截断上升，形成轻重两档跳高
    if (jumpReleased && this.body.velocity.y < 0) {
      this.body.setVelocityY(this.body.velocity.y * 0.45);
    }

    // 加速度/摩擦移动模型：起步加速、松键滑停、急转搓地；自动走位优先于键盘
    let inputDir: number;
    if (this.autoWalkTarget !== null) {
      const dx = this.autoWalkTarget - this.view.x;
      if (Math.abs(dx) <= 8) {
        this.autoWalkTarget = null;
        const arrived = this.autoWalkDone;
        this.autoWalkDone = null;
        this.body.setVelocityX(0);
        inputDir = 0;
        arrived?.();
      } else {
        inputDir = Math.sign(dx);
      }
    } else {
      inputDir = (right ? 1 : 0) - (left ? 1 : 0);
    }
    let vx = this.body.velocity.x;
    if (inputDir !== 0) {
      const turning = Math.sign(inputDir) !== Math.sign(vx) && Math.abs(vx) > 120;
      const accel = onGround ? Player.ACCEL_GROUND : Player.ACCEL_AIR;
      vx += inputDir * (turning ? accel * Player.TURN_BOOST : accel) * (delta / 1000);
      vx = Phaser.Math.Clamp(vx, -this.opts.speed, this.opts.speed);
      if (turning && onGround && this.scene.time.now >= this.skidDustAt) {
        this.skidDustAt = this.scene.time.now + Player.SKID_DUST_MS;
        Effects.dust(this.scene, this.view.x, this.view.y + this.opts.height / 2 - 2, 3, 14);
      }
    } else {
      const decel = (onGround ? Player.DECEL_GROUND : Player.DECEL_AIR) * (delta / 1000);
      vx = Math.abs(vx) <= decel ? 0 : vx - Math.sign(vx) * decel;
    }
    this.body.setVelocityX(vx);
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
    this.cancelAutoWalk();
    this.attachedVine?.startCooldown(0);
    this.attachedVine = null;
    this.body.enable = true;
    this.body.setAllowGravity(false);
    this.body.setGravityY(0);
    this.body.setVelocity(0, 0);
  }

  /** 解除锁定（房间交互面板关闭后恢复走动） */
  unfreeze(): void {
    this.frozen = false;
  }

  /** 自动走位到目标 x（房间点击物件自动走近），到达后回调一次 */
  autoWalkTo(x: number, onArrived?: () => void): void {
    // 目标收进本场景物理边界内，保证真的走得到并触发回调（森林边界覆盖全图，行为不变）
    const bounds = this.scene.physics.world.bounds;
    const minX = Math.max(20, bounds.left + 24);
    const maxX = Math.min(940, bounds.right - 24);
    this.autoWalkTarget = Phaser.Math.Clamp(x, minX, maxX);
    this.autoWalkDone = onArrived ?? null;
  }

  cancelAutoWalk(): void {
    this.autoWalkTarget = null;
    this.autoWalkDone = null;
  }

  get attached(): Vine | null {
    return this.attachedVine;
  }

  /** 抓藤悬挂时身体中心与握点的距离：让画面上的手正好落在花环处 */
  private static readonly VINE_HANG_PX = 18;

  /** 抓住藤蔓：停用物理体，由藤蔓摆荡驱动位置 */
  attachVine(vine: Vine): void {
    this.attachedVine = vine;
    vine.grab(this.body.velocity.x);
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.opts.sfx?.grab();
    // 抓住瞬间“收紧”：定格举手帧 + 轻微压缩脉冲，手扣住花环
    this.sprite.anims.stop();
    this.currentAnim = '';
    this.sprite.setTexture('char-yuyu-jump', 2);
    this.squash(1.07, 0.93);
    this.shadow.setAlpha(0.1);
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
    // 松手：面朝甩出方向展开，空中逐帧按新速度播放
    this.facing = velocity.vx >= 0 ? 1 : -1;
    this.displayedFacing = this.facing;
    this.view.scaleX = this.facing;
    this.view.setRotation(0);
    this.wasOnGround = false;
    this.prevFallSpeed = 0;
    this.coyoteTimer = 0;
    Effects.dust(this.scene, vine.handX, vine.handY + 10, 4, 14);
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

    // 双手抓在握点上（身体中心悬在握点下方 VINE_HANG_PX），随摆角倾斜成钟摆
    const hang = Player.VINE_HANG_PX;
    this.view.setPosition(
      vine.handX - Math.sin(vine.angle) * hang,
      vine.handY + Math.cos(vine.angle) * hang,
    );
    this.view.setRotation(vine.angle);
    if (dirX !== 0) {
      this.facing = dirX > 0 ? 1 : -1;
      this.displayedFacing = this.facing;
      this.view.scaleX = this.facing;
    }

    if (this.justPressed('SPACE')) {
      this.releaseVine();
    }
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
    this.lastGroundY = y + this.opts.height / 2;
    this.currentAnim = '';
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.wasOnGround = true;
    this.prevFallSpeed = 0;
    this.squashing = false;
    this.stepTimer = 0;
  }

  private squash(scaleX: number, scaleY: number): void {
    this.squashing = true;
    this.scene.tweens.killTweensOf(this.view);
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

  /** 状态 → 动画：地面循环动画用滞回+最小停留防抖；空中姿势低通滤波防跳帧；
   *  接触阴影随离地高度淡化缩放（贴地实、越高越淡越小） */
  private animate(delta: number, onGround: boolean): void {
    const feet = this.view.y + this.opts.height / 2;
    if (onGround) {
      this.lastGroundY = feet;
    }
    const heightRatio = Phaser.Math.Clamp((feet - this.lastGroundY) / 150, 0, 1);
    this.shadow.setAlpha(Phaser.Math.Linear(0.3, 0.05, heightRatio));
    this.shadow.setScale(Phaser.Math.Linear(1, 0.62, heightRatio), 1);
    const speedRatio =
      this.opts.speed === 0 ? 0 : Math.min(1, Math.abs(this.body.velocity.x) / this.opts.speed);

    if (!onGround) {
      const vy = this.body.velocity.y;
      if (vy < -25) {
        this.airAnim = 'yuyu-jump';
      } else if (vy > 25) {
        this.airAnim = 'yuyu-fall';
      }
      // 新阶段从第 0 帧起步，随后低通滤波推进——姿势逐帧过渡不跳帧
      if (this.airAnim !== this.prevAirAnim) {
        this.prevAirAnim = this.airAnim;
        this.airPose = 0;
      }
      const target =
        this.airAnim === 'yuyu-jump'
          ? Phaser.Math.Clamp((vy - this.jumpLaunchVy) / -this.jumpLaunchVy, 0, 1)
          : Phaser.Math.Clamp(vy / 700, 0, 1);
      this.airPose += (target - this.airPose) * Math.min(1, delta * 0.012);
      this.setAirFrame(
        this.airAnim === 'yuyu-jump' ? 'char-yuyu-jump' : 'char-yuyu-fall',
        this.airPose,
      );
      this.stepTimer = 0;
    } else if (speedRatio > 0.05 || this.groundAnim === 'yuyu-run') {
      // 滞回：进入跑需 >0.12，退出跑需 <0.05，且至少停留 90ms，防高频互切
      const wantRun = this.groundAnim === 'yuyu-run' ? speedRatio > 0.05 : speedRatio > 0.12;
      if (wantRun !== (this.groundAnim === 'yuyu-run') && this.scene.time.now - this.groundAnimSince > 90) {
        this.groundAnim = wantRun ? 'yuyu-run' : 'yuyu-idle';
        this.groundAnimSince = this.scene.time.now;
      }
      this.playAnim(this.groundAnim);
      if (this.groundAnim === 'yuyu-run') {
        this.stepTimer -= delta;
        if (this.stepTimer <= 0) {
          this.stepTimer = Player.STEP_INTERVAL_MS;
          this.opts.sfx?.step();
        }
      } else {
        this.stepTimer = 0;
      }
    } else {
      this.groundAnim = 'yuyu-idle';
      this.playAnim('yuyu-idle');
      this.stepTimer = 0;
    }

    // 下落纵向伸展（压扁 tween 进行中不覆盖）
    if (!onGround && !this.squashing) {
      const targetY = 1 + Math.min(0.1, Math.max(0, this.body.velocity.y - 150) / 5500);
      this.view.scaleY += (targetY - this.view.scaleY) * Math.min(1, delta * 0.01);
    }
  }

  /** 空中逐帧：停掉循环动画后按进度直接设帧（0..3） */
  private setAirFrame(texture: string, progress: number): void {
    const frame = Math.min(3, Math.floor(progress * 4));
    if (this.currentAnim !== texture) {
      this.sprite.anims.stop();
      this.currentAnim = texture;
    }
    if (this.sprite.frame.name !== String(frame)) {
      this.sprite.setTexture(texture, frame);
    }
  }

  private playAnim(key: string): void {
    if (key === this.currentAnim) {
      return;
    }
    this.currentAnim = key;
    this.sprite.play(key, true);
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
