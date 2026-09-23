export type VideoEmbed = { kind: 'iframe' | 'video'; src: string };

const YOUTUBE_WATCH = /(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/)([\w-]{6,})/;
const YOUTUBE_SHORT = /youtu\.be\/([\w-]{6,})/;
const VIMEO = /vimeo\.com\/(\d+)/;
const DIRECT_VIDEO_FILE = /\.(mp4|webm|ogg)(\?.*)?$/i;

// Convierte un link de video "humano" (YouTube, Vimeo, o un .mp4 directo) en
// algo que se pueda incrustar. Si no reconocemos el formato, lo intentamos
// como iframe de todos modos — funciona para bastantes proveedores que ya
// exponen su propia URL de embed.
export function toVideoEmbed(url: string): VideoEmbed {
  const youtubeId = url.match(YOUTUBE_WATCH)?.[1] ?? url.match(YOUTUBE_SHORT)?.[1];
  if (youtubeId) {
    return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${youtubeId}` };
  }

  const vimeoId = url.match(VIMEO)?.[1];
  if (vimeoId) {
    return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeoId}` };
  }

  if (DIRECT_VIDEO_FILE.test(url)) {
    return { kind: 'video', src: url };
  }

  return { kind: 'iframe', src: url };
}
