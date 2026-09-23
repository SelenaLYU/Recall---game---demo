import Phaser from 'phaser';
import introVideoUrl from '../../assets/animation/南风不回信游戏开头动画3.mp4?url';
import introVoiceUrl from '../../assets/audio/intro-voice.wav?url';
import { BASE_WIDTH, BASE_HEIGHT, applyHDCamera } from '../systems/Resolution';
import { showForestLoadingUI, type LoadingUIHandle } from '../ui/ForestLoadingUI';

const VOICE_KEY = 'intro-original-voice';
const VIDEO_KEY = 'intro-complete-video';

/** 视频显示画面，原声通过与菜单配乐相同的音频系统播放。 */
export default class IntroScene extends Phaser.Scene {
  private loadingHint?: Phaser.GameObjects.Text;
  private loadingOverlay?: LoadingUIHandle;
  private loadingShownAt = 0;

  constructor() {
    super('intro');
  }

  preload(): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#000000');
    this.loadingShownAt = performance.now();
    this.loadingOverlay = showForestLoadingUI(this, '正在加载开场动画', '循着花香，寻找记忆', false);
    if (!this.cache.audio.exists(VOICE_KEY)) this.load.audio(VOICE_KEY, introVoiceUrl);
    if (!this.cache.binary.exists(VIDEO_KEY)) this.load.binary(VIDEO_KEY, introVideoUrl);
  }

  create(): void {
    this.loadingHint?.destroy();
    this.loadingHint = undefined;
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#000000');
    let leaving = false;
    let readyToPlay = false;
    let playStarted = false;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    let firstFrameTimer: ReturnType<typeof setTimeout> | undefined;
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
      // Put the next loading screen over the canvas before stopping the video.
      showForestLoadingUI(this.scene.get('forest'));
      this.loadingOverlay?.destroy();
      this.loadingOverlay = undefined;
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
      if (firstFrameTimer) clearTimeout(firstFrameTimer);
      video.setScale(Math.min(BASE_WIDTH / width, BASE_HEIGHT / height));
      hint.setVisible(false);
      // Phaser emits "created" on the first video frame, after play() starts.
      this.loadingOverlay?.destroy();
      this.loadingOverlay = undefined;
    });
    video.on('playing', syncVoice);

    video.once('complete', enterForest);
    const showError = () => {
      if (firstFrameTimer) clearTimeout(firstFrameTimer);
      this.loadingOverlay?.destroy();
      this.loadingOverlay = undefined;
      voice?.stop();
      video.video?.remove();
      hint.setText('动画暂时无法播放\n可点击右上角“跳过动画”继续').setVisible(true);
    };
    video.on('error', showError);
    video.on('unsupported', showError);

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = '跳过动画 ›';
    skip.setAttribute('aria-label', '跳过开场动画');
    skip.style.cssText = 'position:fixed;z-index:2147481500;color:#fff;background:#26302f;border:0;border-radius:4px;padding:10px 16px;font:18px Arial,"Microsoft YaHei",sans-serif;white-space:nowrap;cursor:pointer;';
    skip.addEventListener('click', enterForest);
    document.body.append(skip);

    const startPlayback = () => {
      if (leaving || !readyToPlay || playStarted || !videoBlobUrl) return;
      playStarted = true;
      // The video is muted; waiting for audio unlock can leave this screen stuck.
      video.play(false);
      firstFrameTimer = setTimeout(() => {
        if (!leaving && this.loadingOverlay) showError();
      }, 15000);
    };
    const cleanup = () => {
      leaving = true;
      this.loadingOverlay?.destroy();
      this.loadingOverlay = undefined;
      this.sound.off(Phaser.Sound.Events.UNLOCKED, syncVoice);
      if (startTimer) clearTimeout(startTimer);
      if (firstFrameTimer) clearTimeout(firstFrameTimer);
      waitingTimer?.remove(false);
      const media = video.video;
      media?.removeEventListener('pause', pauseVoice);
      media?.removeEventListener('playing', onMediaPlaying);
      media?.removeEventListener('ended', enterForest);
      media?.removeEventListener('seeking', pauseVoice);
      media?.removeEventListener('seeked', syncVoice);
      media?.removeEventListener('waiting', onWaiting);
      media?.remove();
      skip.remove();
      this.scale.off(Phaser.Scale.Events.RESIZE, positionMedia);
      window.removeEventListener('resize', positionMedia);
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
      voice?.destroy();
      video.destroy();
      if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.sound.once(Phaser.Sound.Events.UNLOCKED, syncVoice);
    // 视频自身静音，避免与提取出的原声音轨重复播放。
    const videoBytes = this.cache.binary.get(VIDEO_KEY) as ArrayBuffer | undefined;
    const videoBlobUrl = videoBytes
      ? URL.createObjectURL(new Blob([videoBytes], { type: 'video/mp4' })) : undefined;
    if (videoBlobUrl) video.loadURL([{ url: videoBlobUrl, type: 'mp4' }], true);
    const media = video.video;
    // Phaser sets autoplay when noAudio=true. Disable it so play() can register
    // the first-frame callback after the four-second loading screen.
    if (media) {
      media.autoplay = false;
      media.removeAttribute('autoplay');
      media.pause();
      media.style.cssText = 'position:fixed;z-index:2147481000;pointer-events:none;object-fit:contain;background:#000;display:block;';
      document.body.append(media);
    }
    const positionMedia = () => {
      const bounds = this.game.canvas.getBoundingClientRect();
      if (media) {
        media.style.left = `${bounds.left}px`;
        media.style.top = `${bounds.top}px`;
        media.style.width = `${bounds.width}px`;
        media.style.height = `${bounds.height}px`;
      }
      skip.style.left = `${bounds.right - 24 * bounds.width / BASE_WIDTH}px`;
      skip.style.top = `${bounds.top + 24 * bounds.height / BASE_HEIGHT}px`;
      skip.style.transform = 'translateX(-100%)';
    };
    positionMedia();
    this.scale.on(Phaser.Scale.Events.RESIZE, positionMedia);
    window.addEventListener('resize', positionMedia);
    const onMediaPlaying = () => {
      if (leaving) return;
      if (firstFrameTimer) clearTimeout(firstFrameTimer);
      this.loadingOverlay?.destroy();
      this.loadingOverlay = undefined;
      hint.setVisible(false);
      syncVoice();
    };
    media?.addEventListener('pause', pauseVoice);
    media?.addEventListener('playing', onMediaPlaying);
    media?.addEventListener('ended', enterForest);
    media?.addEventListener('seeking', pauseVoice);
    media?.addEventListener('seeked', syncVoice);
    media?.addEventListener('waiting', onWaiting);
    if (!videoBlobUrl) {
      this.loadingOverlay?.destroy();
      this.loadingOverlay = undefined;
      hint.setText('动画素材加载失败\n请刷新页面重试，或跳过动画');
    } else {
      const remaining = Math.max(0, 4000 - (performance.now() - this.loadingShownAt));
      startTimer = setTimeout(() => {
        readyToPlay = true;
        startPlayback();
      }, remaining);
    }
  }
}
