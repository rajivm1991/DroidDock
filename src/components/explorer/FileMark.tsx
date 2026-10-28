import folderSvg from "../../assets/file-glyphs/folder.svg?raw";
import fileSvg from "../../assets/file-glyphs/file.svg?raw";
import imageSvg from "../../assets/file-glyphs/image.svg?raw";
import videoSvg from "../../assets/file-glyphs/video.svg?raw";
import audioSvg from "../../assets/file-glyphs/audio.svg?raw";
import archiveSvg from "../../assets/file-glyphs/archive.svg?raw";
import codeSvg from "../../assets/file-glyphs/code.svg?raw";
import documentSvg from "../../assets/file-glyphs/document.svg?raw";
import pdfSvg from "../../assets/file-glyphs/pdf.svg?raw";
import textSvg from "../../assets/file-glyphs/text.svg?raw";
import markdownSvg from "../../assets/file-glyphs/markdown.svg?raw";
import htmlSvg from "../../assets/file-glyphs/html.svg?raw";
import cssSvg from "../../assets/file-glyphs/css.svg?raw";
import javascriptSvg from "../../assets/file-glyphs/javascript.svg?raw";
import typescriptSvg from "../../assets/file-glyphs/typescript.svg?raw";
import jsonSvg from "../../assets/file-glyphs/json.svg?raw";
import xmlSvg from "../../assets/file-glyphs/xml.svg?raw";
import pythonSvg from "../../assets/file-glyphs/python.svg?raw";
import javaSvg from "../../assets/file-glyphs/java.svg?raw";
import rustSvg from "../../assets/file-glyphs/rust.svg?raw";
import goSvg from "../../assets/file-glyphs/go.svg?raw";
import cppSvg from "../../assets/file-glyphs/cpp.svg?raw";
import rubySvg from "../../assets/file-glyphs/ruby.svg?raw";
import phpSvg from "../../assets/file-glyphs/php.svg?raw";
import swiftSvg from "../../assets/file-glyphs/swift.svg?raw";
import kotlinSvg from "../../assets/file-glyphs/kotlin.svg?raw";
import wordSvg from "../../assets/file-glyphs/word.svg?raw";
import spreadsheetSvg from "../../assets/file-glyphs/spreadsheet.svg?raw";
import presentationSvg from "../../assets/file-glyphs/presentation.svg?raw";
import csvSvg from "../../assets/file-glyphs/csv.svg?raw";
import ebookSvg from "../../assets/file-glyphs/ebook.svg?raw";
import fontSvg from "../../assets/file-glyphs/font.svg?raw";
import appSvg from "../../assets/file-glyphs/app.svg?raw";
import diskSvg from "../../assets/file-glyphs/disk.svg?raw";
import apkSvg from "../../assets/file-glyphs/apk.svg?raw";
import databaseSvg from "../../assets/file-glyphs/database.svg?raw";
import configSvg from "../../assets/file-glyphs/config.svg?raw";
import lockSvg from "../../assets/file-glyphs/lock.svg?raw";
import gitSvg from "../../assets/file-glyphs/git.svg?raw";
import dockerSvg from "../../assets/file-glyphs/docker.svg?raw";
import yamlSvg from "../../assets/file-glyphs/yaml.svg?raw";
import shellSvg from "../../assets/file-glyphs/shell.svg?raw";
import logSvg from "../../assets/file-glyphs/log.svg?raw";
import calendarSvg from "../../assets/file-glyphs/calendar.svg?raw";
import contactSvg from "../../assets/file-glyphs/contact.svg?raw";
import subtitleSvg from "../../assets/file-glyphs/subtitle.svg?raw";
import model3dSvg from "../../assets/file-glyphs/model3d.svg?raw";
import designSvg from "../../assets/file-glyphs/design.svg?raw";
import certificateSvg from "../../assets/file-glyphs/certificate.svg?raw";
import playlistSvg from "../../assets/file-glyphs/playlist.svg?raw";
import torrentSvg from "../../assets/file-glyphs/torrent.svg?raw";
import emailSvg from "../../assets/file-glyphs/email.svg?raw";
import linkSvg from "../../assets/file-glyphs/link.svg?raw";
import packageSvg from "../../assets/file-glyphs/package.svg?raw";
import bookSvg from "../../assets/file-glyphs/book.svg?raw";
import tableSvg from "../../assets/file-glyphs/table.svg?raw";
import slidesSvg from "../../assets/file-glyphs/slides.svg?raw";
import binarySvg from "../../assets/file-glyphs/binary.svg?raw";
import vectorSvg from "../../assets/file-glyphs/vector.svg?raw";

/**
 * Type-specific SVG glyphs from src/assets/file-glyphs so common phone and Mac
 * files are recognizable in List, Icons, and Columns. Extensions map to the
 * closest mark, with fallbacks for image, video, audio, archive, code,
 * document, and generic file. The size prop scales sm / md / lg; currentColor
 * keeps glyphs readable in light and dark themes. Thumbnails from the parent
 * still replace this mark when provided. Unknown extensions stay on the generic
 * file glyph — no emoji, icon fonts, or SF Symbols.
 */

export type FileMarkSize = "sm" | "md" | "lg";

type GlyphKind =
  | "folder"
  | "file"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "code"
  | "document"
  | "pdf"
  | "text"
  | "markdown"
  | "html"
  | "css"
  | "javascript"
  | "typescript"
  | "json"
  | "xml"
  | "python"
  | "java"
  | "rust"
  | "go"
  | "cpp"
  | "ruby"
  | "php"
  | "swift"
  | "kotlin"
  | "word"
  | "spreadsheet"
  | "presentation"
  | "csv"
  | "ebook"
  | "font"
  | "app"
  | "disk"
  | "apk"
  | "database"
  | "config"
  | "lock"
  | "git"
  | "docker"
  | "yaml"
  | "shell"
  | "log"
  | "calendar"
  | "contact"
  | "subtitle"
  | "model3d"
  | "design"
  | "certificate"
  | "playlist"
  | "torrent"
  | "email"
  | "link"
  | "package"
  | "book"
  | "table"
  | "slides"
  | "binary"
  | "vector";

const GLYPHS: Record<GlyphKind, string> = {
  folder: folderSvg,
  file: fileSvg,
  image: imageSvg,
  video: videoSvg,
  audio: audioSvg,
  archive: archiveSvg,
  code: codeSvg,
  document: documentSvg,
  pdf: pdfSvg,
  text: textSvg,
  markdown: markdownSvg,
  html: htmlSvg,
  css: cssSvg,
  javascript: javascriptSvg,
  typescript: typescriptSvg,
  json: jsonSvg,
  xml: xmlSvg,
  python: pythonSvg,
  java: javaSvg,
  rust: rustSvg,
  go: goSvg,
  cpp: cppSvg,
  ruby: rubySvg,
  php: phpSvg,
  swift: swiftSvg,
  kotlin: kotlinSvg,
  word: wordSvg,
  spreadsheet: spreadsheetSvg,
  presentation: presentationSvg,
  csv: csvSvg,
  ebook: ebookSvg,
  font: fontSvg,
  app: appSvg,
  disk: diskSvg,
  apk: apkSvg,
  database: databaseSvg,
  config: configSvg,
  lock: lockSvg,
  git: gitSvg,
  docker: dockerSvg,
  yaml: yamlSvg,
  shell: shellSvg,
  log: logSvg,
  calendar: calendarSvg,
  contact: contactSvg,
  subtitle: subtitleSvg,
  model3d: model3dSvg,
  design: designSvg,
  certificate: certificateSvg,
  playlist: playlistSvg,
  torrent: torrentSvg,
  email: emailSvg,
  link: linkSvg,
  package: packageSvg,
  book: bookSvg,
  table: tableSvg,
  slides: slidesSvg,
  binary: binarySvg,
  vector: vectorSvg,
};

/** Exact extension → glyph. Prefer this over broad buckets when both match. */
const EXT_TO_GLYPH: Record<string, GlyphKind> = {
  // Documents
  pdf: "pdf",
  txt: "text",
  text: "text",
  rtf: "text",
  md: "markdown",
  mdown: "markdown",
  markdown: "markdown",
  doc: "word",
  docx: "word",
  odt: "word",
  pages: "word",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  ods: "spreadsheet",
  numbers: "spreadsheet",
  csv: "csv",
  tsv: "csv",
  ppt: "presentation",
  pptx: "presentation",
  odp: "presentation",
  key: "slides",
  epub: "ebook",
  mobi: "ebook",
  azw: "ebook",
  azw3: "ebook",
  fb2: "ebook",

  // Web / markup
  html: "html",
  htm: "html",
  xhtml: "html",
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  json: "json",
  jsonc: "json",
  json5: "json",
  xml: "xml",
  svg: "vector",
  yaml: "yaml",
  yml: "yaml",
  toml: "config",
  ini: "config",
  conf: "config",
  cfg: "config",
  env: "config",
  properties: "config",
  plist: "config",

  // Languages
  py: "python",
  pyw: "python",
  pyi: "python",
  java: "java",
  class: "java",
  jar: "package",
  rs: "rust",
  go: "go",
  c: "cpp",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  h: "cpp",
  hh: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  rb: "ruby",
  erb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  cs: "code",
  m: "code",
  mm: "code",
  scala: "code",
  groovy: "code",
  lua: "code",
  r: "code",
  pl: "code",
  pm: "code",
  dart: "code",
  vue: "code",
  svelte: "code",

  // Shell / logs
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ps1: "shell",
  bat: "shell",
  cmd: "shell",
  log: "log",

  // Packages / apps / installers
  apk: "apk",
  aab: "apk",
  xapk: "apk",
  app: "app",
  dmg: "disk",
  iso: "disk",
  img: "disk",
  pkg: "package",
  deb: "package",
  rpm: "package",
  msi: "package",
  exe: "binary",
  dll: "binary",
  so: "binary",
  dylib: "binary",
  bin: "binary",
  wasm: "binary",

  // Archives (also covered by ARCHIVE_EXT fallback)
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",
  tgz: "archive",
  bz2: "archive",
  xz: "archive",
  lz: "archive",
  lzma: "archive",
  zst: "archive",
  cab: "archive",

  // Media extras
  srt: "subtitle",
  vtt: "subtitle",
  ass: "subtitle",
  ssa: "subtitle",
  sub: "subtitle",
  m3u: "playlist",
  m3u8: "playlist",
  pls: "playlist",
  xspf: "playlist",

  // Design / 3D / fonts
  psd: "design",
  ai: "design",
  sketch: "design",
  fig: "design",
  xd: "design",
  afdesign: "design",
  afphoto: "design",
  blend: "model3d",
  obj: "model3d",
  fbx: "model3d",
  stl: "model3d",
  gltf: "model3d",
  glb: "model3d",
  usdz: "model3d",
  "3ds": "model3d",
  ttf: "font",
  otf: "font",
  woff: "font",
  woff2: "font",
  eot: "font",
  fon: "font",

  // Data / security / misc
  db: "database",
  sqlite: "database",
  sqlite3: "database",
  sql: "database",
  mdb: "database",
  accdb: "database",
  // `.key` stays Keynote (slides) above — common on Mac; PEM/private keys use pem/crt/p12.
  pem: "certificate",
  crt: "certificate",
  cer: "certificate",
  p12: "certificate",
  pfx: "certificate",
  lock: "lock",
  gpg: "lock",
  asc: "lock",
  git: "git",
  gitignore: "git",
  gitattributes: "git",
  dockerfile: "docker",
  dockerignore: "docker",
  ics: "calendar",
  vcf: "contact",
  vcard: "contact",
  torrent: "torrent",
  eml: "email",
  msg: "email",
  url: "link",
  webloc: "link",
  lnk: "link",
};

const IMAGE_EXT = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "ico",
  "heic",
  "heif",
  "tif",
  "tiff",
  "avif",
  "jxl",
  "raw",
  "cr2",
  "nef",
  "arw",
  "dng",
]);
const VIDEO_EXT = new Set([
  "mp4",
  "avi",
  "mov",
  "mkv",
  "flv",
  "wmv",
  "webm",
  "m4v",
  "3gp",
  "mpeg",
  "mpg",
  "m2ts",
  "ts",
  "ogv",
]);
const AUDIO_EXT = new Set([
  "mp3",
  "wav",
  "flac",
  "aac",
  "ogg",
  "m4a",
  "wma",
  "opus",
  "aiff",
  "aif",
  "alac",
  "mid",
  "midi",
]);
const ARCHIVE_EXT = new Set([
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "lz",
  "lzma",
  "zst",
  "cab",
]);
const CODE_EXT = new Set([
  "js",
  "ts",
  "jsx",
  "tsx",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "cs",
  "php",
  "rb",
  "go",
  "rs",
  "swift",
  "kt",
  "html",
  "htm",
  "css",
  "scss",
  "json",
  "xml",
  "yaml",
  "yml",
]);
const DOCUMENT_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "txt",
  "rtf",
  "odt",
  "xls",
  "xlsx",
  "csv",
  "ods",
  "ppt",
  "pptx",
  "odp",
  "key",
  "md",
  "pages",
  "numbers",
]);

function normalizeExt(extension: string | null): string {
  if (!extension) return "";
  return extension.replace(/^\./, "").toLowerCase();
}

function glyphKind(directory: boolean, extension: string | null): GlyphKind {
  if (directory) return "folder";
  const ext = normalizeExt(extension);
  if (!ext) return "file";
  const specific = EXT_TO_GLYPH[ext];
  if (specific) return specific;
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (ARCHIVE_EXT.has(ext)) return "archive";
  if (CODE_EXT.has(ext)) return "code";
  if (DOCUMENT_EXT.has(ext)) return "document";
  return "file";
}

export function FileMark({
  directory,
  extension,
  size = "sm",
}: {
  directory: boolean;
  extension: string | null;
  size?: FileMarkSize;
}) {
  const kind = glyphKind(directory, extension);
  const label = directory
    ? "Folder"
    : normalizeExt(extension)
      ? `${normalizeExt(extension).toUpperCase()} file`
      : "File";

  return (
    <span
      className={`file-mark file-mark--${size} file-mark--${kind}`}
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: GLYPHS[kind] }}
    />
  );
}
