import Phaser from 'phaser';
import musicUrl from '../assets/audio/menu-room-bgm.mp3?url';

const MUSIC_KEY = 'music-menu-room';

export function preloadMenuRoomMusic(scene: Phaser.Scene): void {
  if (!scene.cache.audio.exists(MUSIC_KEY)) {
    scene.load.audio(MUSIC_KEY, musicUrl);
  }
}

/** 由当前场景持有音乐；离开场景时停止并清理，避免重玩后叠加。 */
export function playMenuRoomMusic(scene: Phaser.Scene): void {
  if (!scene.cache.audio.exists(MUSIC_KEY)) return;

  const music = scene.sound.add(MUSIC_KEY, { loop: true, volume: 0.35 });
  let active = true;

  const start = () => {
    if (active && !scene.sound.locked && !music.isPlaying) {
      music.play();
    }
  };

  const cleanup = () => {
    if (!active) return;
    active = false;
    scene.sound.off(Phaser.Sound.Events.UNLOCKED, start);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    scene.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
    music.destroy();
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

  if (scene.sound.locked) {
    // 浏览器首次访问需要用户点击后才允许播放有声内容。
    scene.sound.once(Phaser.Sound.Events.UNLOCKED, start);
  } else {
    start();
  }
}
