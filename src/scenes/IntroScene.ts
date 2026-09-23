import Phaser from 'phaser';
import introVideoUrl from '../../assets/animation/南风不回信游戏开头动画3.mp4?url';
import introVoiceUrl from '../../assets/audio/intro-voice.wav?url';
import { BASE_WIDTH, BASE_HEIGHT, applyHDCamera } from '../systems/Resolution';

const VOICE_KEY = 'intro-original-voice';
const VIDEO_KEY = 'intro-complete-video';

/** 视频显示画面，原声通过与菜单配乐相同的音频系统播放。 */
export default class IntroScene extends Phaser.Scene {
  private loadingHint?: Phaser.GameObjects.Text;

  constructor() {
    super('intro');
  }

  preload(): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#000000');
    this.loadingHint = this.add.text(BASE_WIDTH / 2, BASE_HEIGHT / 2, '正在加载开场动画…', {
      fontSize: '22px', color: '#e6cf97',
    }).setOrigin(0.5);
    if (!this.cache.audio.exists(VOICE_KEY)) this.load.audio(VOICE_KEY, introVoiceUrl);
    if (!this.cache.binary.exists(VIDEO_KEY)) this.load.binary(VIDEO_KEY, introVideoUrl);
  }

  create(): void {
    this.loadingHint?.destroy();
    this.loadingHint = undefined;
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#000000');
    let leaving = false;
    let waitingTimer: Phaser.Time.TimerEvent | undefined;
    const hint = this.add.text(BASE_WIDTH / 2, BASE_HEIGHT / 2, '正在加载开场动画…', {
      fontSize: '22px', color: '#e6cf97', align: 'center',
      backgroundColor: '#10151c', padding: { x: 20, y: 12 },
    }).setOrigin(0.5).setDepth(10);
    const video = this.add.video(BASE_WIDTH / 2, BASE_HEIGHT / 2).setDepth(0);
    const voice = this.cache.audio.exists(VOICE_KEY)
      ? this.sound.add(VOICE_KEY, { loop: false, volume: 1 }) as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound
      : undefined;

    const enterForest = () => {
      if (leaving) return;
      leaving = true;
      voice?.stop();
      video.stop(false);
      this.scene.start('forest');
    };
    const pauseVoice = () => {
      waitingTimer?.remove(false);
      waitingTimer = undefined;
      if (voice?.isPlaying) voice.pause();
    };
    const syncVoice = () => {
      waitingTimer?.remove(false);
      waitingTimer = undefined;
      const media = video.video;
      if (leaving || !voice || !media || this.sound.locked) return;
      if (media.paused || media.seeking || media.ended) return;
      // 正常播放期间声音连续运行，绝不定时 seek 或重启音频。
      if (voice.isPlaying) return;
      const position = media.currentTime;
      if (position >= voice.duration) return;
      if (voice.isPaused) {
        voice.setSeek(position);
        voice.resume();
      } else {
        voice.play({ seek: position });
      }
    };
    const onWaiting = () => {
      // 忽略短暂的解码波动，只在持续等待时暂停原声。
      if (!waitingTimer) waitingTimer = this.time.delayedCall(250, pauseVoice);
    };
    video.on('created', (_video: Phaser.GameObjects.Video, width: number, height: number) => {
      video.setScale(Math.min(BASE_WIDTH / width, BASE_HEIGHT / height));
      hint.setVisible(false);
      syncVoice();
    });
    video.on('playing', syncVoice);

    video.once('complete', enterForest);
    const showError = () => {
      voice?.stop();
      hint.setText('动画暂时无法播放\n可点击右上角“跳过动画”继续').setVisible(true);
    };
    video.on('error', showError);
    video.on('unsupported', showError);

    const skip = this.add.text(BASE_WIDTH - 24, 24, '跳过动画 ›', {
      fontSize: '18px', color: '#ffffff', backgroundColor: '#26302f',
      padding: { x: 16, y: 10 },
    }).setOrigin(1, 0).setDepth(20).setInteractive({ useHandCursor: true });
    skip.once('pointerdown', (
      _pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      enterForest();
    });

    const startPlayback = () => {
      if (leaving || this.sound.locked || !voice) return;
      video.play(false);
    };
    const cleanup = () => {
      leaving = true;
      this.sound.off(Phaser.Sound.Events.UNLOCKED, startPlayback);
      waitingTimer?.remove(false);
      const media = video.video;
      media?.removeEventListener('pause', pauseVoice);
      media?.removeEventListener('playing', syncVoice);
      media?.removeEventListener('seeking', pauseVoice);
      media?.removeEventListener('seeked', syncVoice);
      media?.removeEventListener('waiting', onWaiting);
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
      voice?.destroy();
      video.destroy();
      if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.sound.once(Phaser.Sound.Events.UNLOCKED, startPlayback);
    // 视频自身静音，避免与提取出的原声音轨重复播放。
    const videoBytes = this.cache.binary.get(VIDEO_KEY) as ArrayBuffer | undefined;
    const videoBlobUrl = videoBytes
      ? URL.createObjectURL(new Blob([videoBytes], { type: 'video/mp4' })) : undefined;
    if (videoBlobUrl) video.loadURL([{ url: videoBlobUrl, type: 'mp4' }], true);
    const media = video.video;
    media?.addEventListener('pause', pauseVoice);
    media?.addEventListener('playing', syncVoice);
    media?.addEventListener('seeking', pauseVoice);
    media?.addEventListener('seeked', syncVoice);
    media?.addEventListener('waiting', onWaiting);
    if (!voice || !videoBlobUrl) {
      hint.setText('动画素材加载失败\n请刷新页面重试，或跳过动画');
    } else {
      startPlayback();
    }
  }
}