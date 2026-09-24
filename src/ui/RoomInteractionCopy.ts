import Phaser from 'phaser';
import { showRoomText, type RoomTextHandle, type RoomTextOptions } from './RoomTextPanel';
import calendarUrl from '../../assets/environment/interactive-calendar-2008-lichun-256x384.png?url';
import flowerpotUrl from '../../assets/environment/interactive-potted-jasmine-384x512.png?url';
import fishBasinUrl from '../../assets/environment/interactive-stone-fish-basin-768x384.png?url';

/** The five records are copied from 房间互动文案与分工.md, including its revised times. */
export function showCalendarText(scene: Phaser.Scene): RoomTextHandle {
  return showRoomText(scene, {
    title: '外公的日历',
    imageUrl: calendarUrl,
    imageAlt: '外公的日历',
    entries: [
      { label: '9月1日', text: '鱼鱼第一次去幼儿园。\n16:15 接她放学。' },
      { label: '9月8日', text: '早上 8:30 带鱼鱼去游乐园。' },
      { label: '9月13日', text: '13:45 送鱼鱼去游泳。' },
      { label: '9月15日', text: '鱼鱼掉了自己第一颗牙' },
      { label: '9月18日', text: '鱼鱼今天没回来，\n跟妈妈出去吃饭了，20点去接她' },
    ],
  });
}

/** Call only after the photo sliding puzzle reports success. */
export function showPhotoMemoryText(scene: Phaser.Scene, completedPhotoUrl: string): RoomTextHandle {
  return showRoomText(scene, {
    title: '那天的照片',
    imageUrl: completedPhotoUrl,
    imageAlt: '外公外婆和鱼鱼在动物园的合照',
    layout: 'photo',
    entries: [{
      text: '那是外公外婆第一次带鱼鱼去动物园。鱼鱼看见老虎吓得一下把头埋进外公怀里，外公和外婆却笑得开怀。外公一直很喜欢这张照片。',
    }],
  });
}

export function showFlowerpotText(scene: Phaser.Scene): RoomTextHandle {
  return showRoomText(scene, {
    title: '花盆',
    imageUrl: flowerpotUrl,
    imageAlt: '风车茉莉花盆',
    entries: [{ text: '这盆风车茉莉爷爷养了5年' }],
  });
}

export function showFishBasinText(scene: Phaser.Scene): RoomTextHandle {
  return showRoomText(scene, {
    title: '鱼缸',
    imageUrl: fishBasinUrl,
    imageAlt: '石头鱼缸',
    entries: [{ text: '爷爷每天起来第一件事就是喂小鱼' }],
  });
}

/** Clock, radio and future inspect text use the same blur, object and right-side copy layout. */
export function showOtherRoomText(scene: Phaser.Scene, options: RoomTextOptions): RoomTextHandle {
  return showRoomText(scene, options);
}
