import fontUrl from '../../assets/fonts/MFYouShu_Noncommercial-Regular.otf?url';

const STYLE_ID = 'recall-font-style';

export function installRecallUIFont(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @font-face {
      font-family: 'MFYouShu';
      src: url("${fontUrl}") format("opentype");
      font-display: swap;
    }

    .recall-ui-font,
    .recall-ui-font * {
      font-family: 'MFYouShu' !important;
    }
  `;

  document.head.append(style);
}