import Phaser from 'phaser';
import endingVideoUrl from '../../assets/animation/ending.mp4?url';
import endingVoiceUrl from '../../assets/audio/ending-voice.wav?url';
import menuBackgroundUrl from '../../assets/ui/menu-opening-background.png?url';
import menuTitleUrl from '../../assets/ui/menu-opening-title.png?url';
import { createMenuMemoryBackground } from '../MenuMemoryBackground';
import { playMenuRoomMusic, preloadMenuRoomMusic } from '../MenuRoomMusic';
import { BASE_WIDTH, BASE_HEIGHT, applyHDCamera } from '../systems/Resolution';
import { showForestLoadingUI, type LoadingUIHandle } from '../ui/ForestLoadingUI';

const VOICE_KEY = 'ending-original-voice';

export default class EndingScene extends Phaser.Scene {
  private loadingOverlay?: LoadingUIHandle;

  constructor() {
    super('ending');
  }

  preload(): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#10151c');
    this.loadingOverlay = showForestLoadingUI(this, '正在加载结尾动画', '循着花香，寻找记忆', false);
    preloadMenuRoomMusic(this);
    if (!this.textures.exists('ui-menu-background')) this.load.image('ui-menu-background', menuBackgroundUrl);
    if (!this.textures.exists('ui-menu-title')) this.load.image('ui-menu-title', menuTitleUrl);
  }

  create(): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#10151c');
    let finished = false;
    let disposed = false;
    let mediaReleased = false;
    let firstFrameTimer: ReturnType<typeof setTimeout> | undefined;
    let waitingTimer: Phaser.Time.TimerEvent | undefined;

    const veil = this.add.rectangle(480, 270, BASE_WIDTH, BASE_HEIGHT, 0x091c16, 0.17);
    const logo = this.add.image(480, 188, 'ui-menu-title').setDisplaySize(540, 180);
    const title = this.add.text(480, 283, '感谢观看', {
      fontFamily: 'serif', fontSize: '29px', color: '#fff9e8', letterSpacing: 5,
    }).setOrigin(0.5).setShadow(0, 2, '#10221a', 5, false, true);
    const subtitle = this.add.text(480, 329, 'RECALL · Demo 到此结束', {
      fontFamily: 'serif', fontSize: '17px', color: '#fff9e8', letterSpacing: 3,
    }).setOrigin(0.5).setShadow(0, 2, '#10221a', 5, false, true);
    const back = this.add.text(480, 411, '返回开始', {
      fontFamily: 'serif', fontSize: '21px', color: '#f8f4e5', letterSpacing: 3,
    }).setOrigin(0.5);
    back.setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#ffffff'));
    back.on('pointerout', () => back.setColor('#f8f4e5'));
    back.on('pointerdown', () => { if (finished) this.scene.start('menu'); });
    const thanks = this.add.container(0, 0, [veil, logo, title, subtitle, back]).setVisible(false);
    const hint = this.add.text(BASE_WIDTH / 2, BASE_HEIGHT / 2, '', {
      fontSize: '22px', color: '#e6cf97', align: 'center', lineSpacing: 10,
    }).setOrigin(0.5).setVisible(false);

    // The video supplies the picture; Phaser Sound plays the extracted original soundtrack.
    const media = document.createElement('video');
    media.playsInline = true;
    media.muted = true;
    media.defaultMuted = true;
    media.volume = 0;
    media.preload = 'auto';
    media.style.cssText = 'position:fixed;z-index:2147481000;pointer-events:none;object-fit:contain;background:#10151c;display:block;opacity:0;';
    let voice = this.cache.audio.exists(VOICE_KEY)
      ? this.sound.add(VOICE_KEY, { loop: false, volume: 1 }) as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound
      : undefined;
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = '跳过动画';
    skip.setAttribute('aria-label', '跳过结尾动画');
    skip.style.cssText = 'position:fixed;z-index:2147482500;color:rgba(247,237,207,.72);background:rgba(14,32,24,.26);border:1px solid rgba(247,237,207,.30);border-radius:3px;padding:7px 12px;font:11px Arial,"Microsoft YaHei",sans-serif;letter-spacing:.14em;box-shadow:0 2px 8px rgba(10,25,18,.25);backdrop-filter:blur(4px);opacity:.78;white-space:nowrap;cursor:pointer;';
    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.textContent = '点击播放并开启声音';
    playButton.hidden = true;
    playButton.style.cssText = 'position:fixed;z-index:2147481500;color:#f7edcf;background:rgba(14,32,24,.65);border:1px solid rgba(247,237,207,.3);border-radius:4px;padding:14px 24px;font:20px Arial,"Microsoft YaHei",sans-serif;cursor:pointer;transform:translate(-50%,-50%);';

    const hideLoading = () => {
      this.loadingOverlay?.destroy();
      this.loadingOverlay = undefined;
    };
    const clearFirstFrameTimer = () => {
      if (firstFrameTimer) clearTimeout(firstFrameTimer);
      firstFrameTimer = undefined;
    };
    const pauseVoice = () => {
      waitingTimer?.remove(false);
      waitingTimer = undefined;
      if (voice?.isPlaying) voice.pause();
    };
    const syncVoice = () => {
      waitingTimer?.remove(false);
      waitingTimer = undefined;
      if (finished || disposed || mediaReleased || !voice || this.sound.locked) return;
      if (media.paused || media.seeking || media.ended || voice.isPlaying) return;
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
      if (!waitingTimer) waitingTimer = this.time.delayedCall(250, pauseVoice);
    };
    const onAudioLoaded = (key: string) => {
      if (key !== VOICE_KEY || finished || disposed || mediaReleased) return;
      voice = this.sound.add(VOICE_KEY, { loop: false, volume: 1 }) as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;
      syncVoice();
    };
    const positionMedia = () => {
      const bounds = this.game.canvas.getBoundingClientRect();
      media.style.left = `${bounds.left}px`;
      media.style.top = `${bounds.top}px`;
      media.style.width = `${bounds.width}px`;
      media.style.height = `${bounds.height}px`;
      skip.style.left = `${bounds.right - 24 * bounds.width / BASE_WIDTH}px`;
      skip.style.top = `${bounds.top + 24 * bounds.height / BASE_HEIGHT}px`;
      skip.style.transform = 'translateX(-100%)';
      playButton.style.left = `${bounds.left + bounds.width / 2}px`;
      playButton.style.top = `${bounds.top + bounds.height / 2}px`;
    };
    const releaseMedia = () => {
      if (mediaReleased) return;
      mediaReleased = true;
      clearFirstFrameTimer();
      waitingTimer?.remove(false);
      waitingTimer = undefined;
      this.sound.off(Phaser.Sound.Events.UNLOCKED, syncVoice);
      this.load.off(Phaser.Loader.Events.FILE_COMPLETE, onAudioLoaded);
      media.removeEventListener('playing', onPlaying);
      media.removeEventListener('ended', finishEnding);
      media.removeEventListener('error', showFailure);
      media.removeEventListener('pause', pauseVoice);
      media.removeEventListener('seeking', pauseVoice);
      media.removeEventListener('seeked', syncVoice);
      media.removeEventListener('waiting', onWaiting);
      voice?.stop();
      voice?.destroy();
      media.pause();
      media.removeAttribute('src');
      media.load();
      media.remove();
    };
    const finishEnding = () => {
      if (finished || disposed) return;
      finished = true;
      releaseMedia();
      hideLoading();
      skip.remove();
      playButton.remove();
      this.scale.off(Phaser.Scale.Events.RESIZE, positionMedia);
      hint.setVisible(false);
      createMenuMemoryBackground(this);
      document.body.style.backgroundColor = '#15251f';
      thanks.setVisible(true);
      // The room music resumes only after the movie has stopped.
      playMenuRoomMusic(this);
    };
    const showFailure = () => {
      if (finished || disposed) return;
      releaseMedia();
      hideLoading();
      playButton.hidden = true;
      hint.setText('结尾动画暂时无法播放\n可点击右上角“继续”查看结束页面').setVisible(true);
      skip.textContent = '继续';
      skip.setAttribute('aria-label', '继续到结束页面');
    };
    const onPlaying = () => {
      if (finished || disposed) return;
      clearFirstFrameTimer();
      hideLoading();
      hint.setVisible(false);
      media.style.opacity = '1';
      syncVoice();
    };
    const showPlayPrompt = () => {
      if (finished || disposed || mediaReleased) return;
      hideLoading();
      hint.setVisible(false);
      playButton.textContent = '点击播放结尾动画';
      playButton.hidden = false;
    };
    const startPlayback = () => {
      if (finished || disposed || mediaReleased) return;
      playButton.hidden = true;
      clearFirstFrameTimer();
      firstFrameTimer = setTimeout(showFailure, 45000);
      void media.play().catch((error: unknown) => {
        if (finished || disposed || mediaReleased) return;
        clearFirstFrameTimer();
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          // Some browsers require a fresh gesture for a new audible video.
          showPlayPrompt();
        } else {
          showFailure();
        }
      });
    };
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      releaseMedia();
      hideLoading();
      skip.removeEventListener('click', finishEnding);
      playButton.removeEventListener('click', startPlayback);
      skip.remove();
      playButton.remove();
      this.scale.off(Phaser.Scale.Events.RESIZE, positionMedia);
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
    };

    media.addEventListener('playing', onPlaying);
    media.addEventListener('ended', finishEnding);
    media.addEventListener('error', showFailure);
    media.addEventListener('pause', pauseVoice);
    media.addEventListener('seeking', pauseVoice);
    media.addEventListener('seeked', syncVoice);
    media.addEventListener('waiting', onWaiting);
    this.sound.on(Phaser.Sound.Events.UNLOCKED, syncVoice);
    skip.addEventListener('click', finishEnding);
    playButton.addEventListener('click', startPlayback);
    document.body.append(media, skip, playButton);
    positionMedia();
    this.scale.on(Phaser.Scale.Events.RESIZE, positionMedia);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

    // Let the browser stream the MP4. Loading the whole video in Phaser's
    // preload() kept this scene on its loading screen on slow connections.
    media.src = endingVideoUrl;
    if (!voice) {
      // The soundtrack may arrive later; join it at the video's current time.
      // Keeping it out of preload() also keeps the skip button available.
      this.load.on(Phaser.Loader.Events.FILE_COMPLETE, onAudioLoaded);
      this.load.audio(VOICE_KEY, endingVoiceUrl);
      this.load.start();
    }
    startPlayback();
  }
}
