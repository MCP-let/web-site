import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'scripts', 'i18n-source');

const languages = [
  { code: 'en', label: 'English', short: 'EN', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', short: '日本語', flag: '🇯🇵' },
  { code: 'zh', label: '中文', short: '中文', flag: '🇨🇳' },
  { code: 'fr', label: 'Français', short: 'FR', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', short: 'DE', flag: '🇩🇪' },
  { code: 'es', label: 'Español', short: 'ES', flag: '🇪🇸' }
];

const pageConfigs = [
  {
    name: 'index',
    templatePath: path.join(sourceRoot, 'index.template.html'),
    fileName: 'index.html',
    rootUrl: 'https://mcplet.ai/',
    localizedUrl: (lang) => `https://mcplet.ai/${lang}/`,
    buildScript: buildIndexRuntime
  },
  {
    name: 'patent',
    templatePath: path.join(sourceRoot, 'patent-notice.template.html'),
    fileName: 'patent-notice.html',
    rootUrl: 'https://mcplet.ai/patent-notice.html',
    localizedUrl: (lang) => `https://mcplet.ai/${lang}/patent-notice.html`,
    buildScript: buildPatentRuntime
  }
];

const extraTranslations = {
  index: {
    en: {
      'nav.gettingStarted': 'Getting Started',
      'nav.specification': 'Specification',
      'nav.faq': 'FAQ',
      'hero.title.gradient': 'AI-First',
      'hero.title.text': 'Capability Units<br>for Modern AI Systems',
      'hero.fact.status.label': 'Status',
      'hero.fact.status.value': 'Draft specification',
      'hero.fact.version.label': 'Current version',
      'hero.fact.updated.label': 'Updated',
      'hero.fact.profiles.label': 'Host profiles',
      'hero.fact.profiles.value': 'WebUI and Agent',
      'hero.fact.maintained.label': 'Maintained by',
      'hero.cta.primary': 'Read Specification',
      'hero.cta.secondary': 'Technical FAQ',
      'hero.resources': `Maintained by the MCPlet Working Group. Start with the <a href="getting-started.html">getting started guide</a>, open the <a href="files/MCPlet-spec-v202603-03.md" target="_blank" rel="noopener">markdown draft</a>, or review the <a href="patent-notice.html">intellectual property notice</a>.`,
      'cta.title': 'Start with the canonical draft',
      'cta.subtitle': 'Use the HTML specification overview for quick reading, the raw markdown for normative source text, and the FAQ for direct answers to adoption questions.',
      'cta.primary': 'Open HTML overview',
      'cta.secondary': 'Open raw markdown',
      'cta.resource': `Need the short version first? Read the <a href="faq.html">technical FAQ</a>.`,
      'footer.gettingStarted': 'Getting Started',
      'footer.specification': 'Specification',
      'footer.faq': 'FAQ',
      'footer.mcpDocs': 'MCP Docs',
      'footer.updated': 'Updated 2026-04-01'
    },
    ja: {
      'nav.gettingStarted': 'はじめに',
      'nav.specification': '仕様',
      'nav.faq': 'FAQ',
      'hero.title.gradient': 'AIファースト',
      'hero.title.text': 'モダンAIシステムのための<br>能力ユニット',
      'hero.fact.status.label': 'ステータス',
      'hero.fact.status.value': '仕様ドラフト',
      'hero.fact.version.label': '現在の版',
      'hero.fact.updated.label': '更新日',
      'hero.fact.profiles.label': 'ホストプロファイル',
      'hero.fact.profiles.value': 'WebUI と Agent',
      'hero.fact.maintained.label': 'メンテナー',
      'hero.cta.primary': '仕様を読む',
      'hero.cta.secondary': '技術FAQ',
      'hero.resources': `MCPlet Working Group が保守しています。<a href="getting-started.html">導入ガイド</a>から始めるか、<a href="files/MCPlet-spec-v202603-03.md" target="_blank" rel="noopener">Markdown 版ドラフト</a>を開くか、<a href="patent-notice.html">知的財産通知</a>を確認してください。`,
      'cta.title': '正本ドラフトから始める',
      'cta.subtitle': '素早く読むには HTML 仕様概要、規範テキストには生の Markdown、導入判断には FAQ を使ってください。',
      'cta.primary': 'HTML 概要を開く',
      'cta.secondary': 'Markdown 原文を開く',
      'cta.resource': `まず短い概要を見るなら、<a href="faq.html">技術FAQ</a>を読んでください。`,
      'footer.gettingStarted': 'はじめに',
      'footer.specification': '仕様',
      'footer.faq': 'FAQ',
      'footer.mcpDocs': 'MCPドキュメント',
      'footer.updated': '更新日 2026-04-01'
    },
    zh: {
      'nav.gettingStarted': '快速开始',
      'nav.specification': '规范',
      'nav.faq': 'FAQ',
      'hero.title.gradient': 'AI 优先',
      'hero.title.text': '面向现代 AI 系统的<br>能力单元',
      'hero.fact.status.label': '状态',
      'hero.fact.status.value': '规范草案',
      'hero.fact.version.label': '当前版本',
      'hero.fact.updated.label': '更新日期',
      'hero.fact.profiles.label': '宿主配置',
      'hero.fact.profiles.value': 'WebUI 与 Agent',
      'hero.fact.maintained.label': '维护方',
      'hero.cta.primary': '阅读规范',
      'hero.cta.secondary': '技术 FAQ',
      'hero.resources': `由 MCPlet Working Group 维护。可先阅读<a href="getting-started.html">快速开始指南</a>，打开<a href="files/MCPlet-spec-v202603-03.md" target="_blank" rel="noopener">Markdown 草案</a>，或查看<a href="patent-notice.html">知识产权声明</a>。`,
      'cta.title': '从规范正本草案开始',
      'cta.subtitle': '快速阅读请使用 HTML 规范概览，规范性源文本请查看原始 Markdown，采用问题可直接参考 FAQ。',
      'cta.primary': '打开 HTML 概览',
      'cta.secondary': '打开原始 Markdown',
      'cta.resource': `想先看简版？请阅读<a href="faq.html">技术 FAQ</a>。`,
      'footer.gettingStarted': '快速开始',
      'footer.specification': '规范',
      'footer.faq': 'FAQ',
      'footer.mcpDocs': 'MCP 文档',
      'footer.updated': '更新于 2026-04-01'
    },
    fr: {
      'nav.gettingStarted': 'Prise en main',
      'nav.specification': 'Spécification',
      'nav.faq': 'FAQ',
      'hero.title.gradient': 'Priorité à l\'IA',
      'hero.title.text': 'Unités de capacité<br>pour les systèmes d\'IA modernes',
      'hero.fact.status.label': 'Statut',
      'hero.fact.status.value': 'Projet de spécification',
      'hero.fact.version.label': 'Version actuelle',
      'hero.fact.updated.label': 'Mis à jour',
      'hero.fact.profiles.label': 'Profils d\'hôte',
      'hero.fact.profiles.value': 'WebUI et Agent',
      'hero.fact.maintained.label': 'Maintenu par',
      'hero.cta.primary': 'Lire la spécification',
      'hero.cta.secondary': 'FAQ technique',
      'hero.resources': `Maintenu par le MCPlet Working Group. Commencez par le <a href="getting-started.html">guide de prise en main</a>, ouvrez le <a href="files/MCPlet-spec-v202603-03.md" target="_blank" rel="noopener">brouillon Markdown</a> ou consultez <a href="patent-notice.html">l'avis de propriété intellectuelle</a>.`,
      'cta.title': 'Commencer par le brouillon canonique',
      'cta.subtitle': 'Utilisez la vue HTML de la spécification pour une lecture rapide, le Markdown brut pour le texte normatif et la FAQ pour les questions d\'adoption.',
      'cta.primary': 'Ouvrir la vue HTML',
      'cta.secondary': 'Ouvrir le Markdown brut',
      'cta.resource': `Besoin d'une version courte ? Lisez la <a href="faq.html">FAQ technique</a>.`,
      'footer.gettingStarted': 'Prise en main',
      'footer.specification': 'Spécification',
      'footer.faq': 'FAQ',
      'footer.mcpDocs': 'Docs MCP',
      'footer.updated': 'Mis à jour le 2026-04-01'
    },
    de: {
      'nav.gettingStarted': 'Erste Schritte',
      'nav.specification': 'Spezifikation',
      'nav.faq': 'FAQ',
      'hero.title.gradient': 'KI-zuerst',
      'hero.title.text': 'Fähigkeitseinheiten<br>für moderne KI-Systeme',
      'hero.fact.status.label': 'Status',
      'hero.fact.status.value': 'Spezifikationsentwurf',
      'hero.fact.version.label': 'Aktuelle Version',
      'hero.fact.updated.label': 'Aktualisiert',
      'hero.fact.profiles.label': 'Host-Profile',
      'hero.fact.profiles.value': 'WebUI und Agent',
      'hero.fact.maintained.label': 'Betreut von',
      'hero.cta.primary': 'Spezifikation lesen',
      'hero.cta.secondary': 'Technische FAQ',
      'hero.resources': `Betreut von der MCPlet Working Group. Beginnen Sie mit dem <a href="getting-started.html">Schnellstart</a>, öffnen Sie den <a href="files/MCPlet-spec-v202603-03.md" target="_blank" rel="noopener">Markdown-Entwurf</a> oder lesen Sie den <a href="patent-notice.html">Hinweis zum geistigen Eigentum</a>.`,
      'cta.title': 'Mit dem kanonischen Entwurf beginnen',
      'cta.subtitle': 'Verwenden Sie die HTML-Übersicht für schnelles Lesen, den rohen Markdown-Entwurf für den normativen Quelltext und die FAQ für direkte Einführungsfragen.',
      'cta.primary': 'HTML-Übersicht öffnen',
      'cta.secondary': 'Rohes Markdown öffnen',
      'cta.resource': `Brauchen Sie zuerst die Kurzfassung? Lesen Sie die <a href="faq.html">technische FAQ</a>.`,
      'footer.gettingStarted': 'Erste Schritte',
      'footer.specification': 'Spezifikation',
      'footer.faq': 'FAQ',
      'footer.mcpDocs': 'MCP-Dokumentation',
      'footer.updated': 'Aktualisiert am 2026-04-01'
    },
    es: {
      'nav.gettingStarted': 'Primeros pasos',
      'nav.specification': 'Especificación',
      'nav.faq': 'FAQ',
      'hero.title.gradient': 'IA primero',
      'hero.title.text': 'Unidades de capacidad<br>para sistemas modernos de IA',
      'hero.fact.status.label': 'Estado',
      'hero.fact.status.value': 'Borrador de especificación',
      'hero.fact.version.label': 'Versión actual',
      'hero.fact.updated.label': 'Actualizado',
      'hero.fact.profiles.label': 'Perfiles de host',
      'hero.fact.profiles.value': 'WebUI y Agent',
      'hero.fact.maintained.label': 'Mantenido por',
      'hero.cta.primary': 'Leer la especificación',
      'hero.cta.secondary': 'FAQ técnica',
      'hero.resources': `Mantenido por el MCPlet Working Group. Empiece con la <a href="getting-started.html">guía de primeros pasos</a>, abra el <a href="files/MCPlet-spec-v202603-03.md" target="_blank" rel="noopener">borrador en Markdown</a> o revise el <a href="patent-notice.html">aviso de propiedad intelectual</a>.`,
      'cta.title': 'Comience con el borrador canónico',
      'cta.subtitle': 'Use la vista HTML de la especificación para una lectura rápida, el Markdown sin procesar para el texto normativo y la FAQ para preguntas directas sobre adopción.',
      'cta.primary': 'Abrir vista HTML',
      'cta.secondary': 'Abrir Markdown sin procesar',
      'cta.resource': `¿Necesita primero la versión corta? Lea la <a href="faq.html">FAQ técnica</a>.`,
      'footer.gettingStarted': 'Primeros pasos',
      'footer.specification': 'Especificación',
      'footer.faq': 'FAQ',
      'footer.mcpDocs': 'Documentación MCP',
      'footer.updated': 'Actualizado el 2026-04-01'
    }
  },
  patent: {
    en: {
      'resources.heading': 'Related Resources',
      'resources.body': 'Use the HTML overview for fast reading, the raw markdown draft for normative source text, and the FAQ for direct adoption questions.',
      'resources.gettingStarted': 'Getting Started',
      'resources.specification': 'Specification Overview',
      'resources.faq': 'Technical FAQ',
      'resources.markdown': 'Raw Markdown Draft',
      'footer.gettingStarted': 'Getting Started',
      'footer.specification': 'Specification',
      'footer.faq': 'FAQ',
      'footer.updated': 'Updated 2026-04-01'
    },
    ja: {
      'resources.heading': '関連リソース',
      'resources.body': '素早く読むには HTML 概要、規範テキストには生の Markdown ドラフト、導入判断には FAQ を使ってください。',
      'resources.gettingStarted': 'はじめに',
      'resources.specification': '仕様概要',
      'resources.faq': '技術FAQ',
      'resources.markdown': 'Markdown 原文ドラフト',
      'footer.gettingStarted': 'はじめに',
      'footer.specification': '仕様',
      'footer.faq': 'FAQ',
      'footer.updated': '更新日 2026-04-01'
    },
    zh: {
      'resources.heading': '相关资源',
      'resources.body': '快速阅读请使用 HTML 概览，规范性源文本请查看原始 Markdown 草案，采用问题可直接参考 FAQ。',
      'resources.gettingStarted': '快速开始',
      'resources.specification': '规范概览',
      'resources.faq': '技术 FAQ',
      'resources.markdown': '原始 Markdown 草案',
      'footer.gettingStarted': '快速开始',
      'footer.specification': '规范',
      'footer.faq': 'FAQ',
      'footer.updated': '更新于 2026-04-01'
    },
    fr: {
      'resources.heading': 'Ressources associées',
      'resources.body': 'Utilisez la vue HTML pour une lecture rapide, le brouillon Markdown brut pour le texte normatif et la FAQ pour les questions directes d\'adoption.',
      'resources.gettingStarted': 'Prise en main',
      'resources.specification': 'Vue d\'ensemble de la spécification',
      'resources.faq': 'FAQ technique',
      'resources.markdown': 'Brouillon Markdown brut',
      'footer.gettingStarted': 'Prise en main',
      'footer.specification': 'Spécification',
      'footer.faq': 'FAQ',
      'footer.updated': 'Mis à jour le 2026-04-01'
    },
    de: {
      'resources.heading': 'Weiterführende Ressourcen',
      'resources.body': 'Verwenden Sie die HTML-Übersicht für schnelles Lesen, den rohen Markdown-Entwurf für den normativen Quelltext und die FAQ für direkte Einführungsfragen.',
      'resources.gettingStarted': 'Erste Schritte',
      'resources.specification': 'Spezifikationsübersicht',
      'resources.faq': 'Technische FAQ',
      'resources.markdown': 'Rohentwurf in Markdown',
      'footer.gettingStarted': 'Erste Schritte',
      'footer.specification': 'Spezifikation',
      'footer.faq': 'FAQ',
      'footer.updated': 'Aktualisiert am 2026-04-01'
    },
    es: {
      'resources.heading': 'Recursos relacionados',
      'resources.body': 'Use la vista HTML para una lectura rápida, el borrador Markdown sin procesar para el texto normativo y la FAQ para preguntas directas sobre adopción.',
      'resources.gettingStarted': 'Primeros pasos',
      'resources.specification': 'Resumen de la especificación',
      'resources.faq': 'FAQ técnica',
      'resources.markdown': 'Borrador Markdown sin procesar',
      'footer.gettingStarted': 'Primeros pasos',
      'footer.specification': 'Especificación',
      'footer.faq': 'FAQ',
      'footer.updated': 'Actualizado el 2026-04-01'
    }
  }
};

await Promise.all(pageConfigs.map((config) => buildPageFamily(config)));
await writeSitemap();

async function buildPageFamily(config) {
  const template = await fs.readFile(config.templatePath, 'utf8');
  const templateTranslations = extractObjectLiteral(template, 'const translations =');
  const translations = mergeTranslations(config.name, templateTranslations);

  for (const language of languages) {
    const outputPath = language.code === 'en'
      ? path.join(projectRoot, config.fileName)
      : path.join(projectRoot, language.code, config.fileName);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const localized = buildLocalizedHtml(template, translations, config, language.code);
    await fs.writeFile(outputPath, localized, 'utf8');
  }
}

function mergeTranslations(pageName, templateTranslations) {
  const pageExtras = extraTranslations[pageName] || {};

  return Object.fromEntries(
    languages.map(({ code }) => [
      code,
      {
        ...templateTranslations.en,
        ...templateTranslations[code],
        ...pageExtras.en,
        ...pageExtras[code]
      }
    ])
  );
}

function buildLocalizedHtml(template, translations, config, languageCode) {
  const translationMap = {
    ...translations.en,
    ...translations[languageCode]
  };
  let html = template;

  html = translateDataI18n(html, translationMap);
  html = html.replace(/<html lang="[^"]+">/, `<html lang="${languageCode}">`);
  html = html.replaceAll('<a href="#" class="logo">', '<a href="index.html" class="logo">');
  html = html.replaceAll('<button class="lang-btn" id="langBtn">', '<button class="lang-btn" id="langBtn" type="button">');
  html = html.replace(/<span id="currentLangLabel">[\s\S]*?<\/span>/, `<span id="currentLangLabel">${getLanguage(languageCode).short}</span>`);
  html = replaceElementById(html, 'langDropdown', buildLangDropdown(config, languageCode));
  html = updateUrlMetadata(html, config, languageCode);
  html = injectAlternateLinks(html, config, languageCode);
  html = rewriteRelativeLinks(html, languageCode);
  html = updateLocalizedMedia(html, config, languageCode);
  html = html.replace(/(\.lang-option\s*\{[\s\S]*?color: var\(--text-secondary\);)/, '$1\n      text-decoration: none;');
  html = stripRuntimeScript(html, config.buildScript());
  html = html.replaceAll(/\sdata-i18n="[^"]+"/g, '');

  return html;
}

function extractObjectLiteral(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Cannot find marker: ${marker}`);
  }

  const braceStart = source.indexOf('{', markerIndex);
  if (braceStart === -1) {
    throw new Error(`Cannot find object literal after marker: ${marker}`);
  }

  const braceEnd = findMatchingBrace(source, braceStart);
  const objectLiteral = source.slice(braceStart, braceEnd + 1);
  return vm.runInNewContext(`(${objectLiteral})`);
}

function findMatchingBrace(source, startIndex) {
  let depth = 0;
  const state = { quote: null, escaped: false };

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (consumeQuotedCharacter(char, state)) {
      continue;
    }

    if (openQuote(char, state)) {
      continue;
    }

    depth = updateBraceDepth(char, depth);
    if (depth === 0 && char === '}') {
      return index;
    }
  }

  throw new Error('Unmatched brace while extracting object literal');
}

function consumeQuotedCharacter(char, state) {
  if (!state.quote) {
    return false;
  }

  if (state.escaped) {
    state.escaped = false;
    return true;
  }

  if (char === '\\') {
    state.escaped = true;
    return true;
  }

  if (char === state.quote) {
    state.quote = null;
  }

  return true;
}

function openQuote(char, state) {
  if (char !== '"' && char !== '\'' && char !== '`') {
    return false;
  }

  state.quote = char;
  return true;
}

function updateBraceDepth(char, depth) {
  if (char === '{') {
    return depth + 1;
  }

  if (char === '}') {
    return depth - 1;
  }

  return depth;
}

function translateDataI18n(source, translations) {
  let html = source;
  const pattern = /<([a-zA-Z0-9]+)([^<>]*?)\sdata-i18n="([^"]+)"([^<>]*?)>([\s\S]*?)<\/\1>/g;

  let previous;
  do {
    previous = html;
    html = html.replaceAll(pattern, (match, tag, before, key, after) => {
      const translation = translations[key];
      if (!translation) {
        return match;
      }
      return `<${tag}${before}${after}>${translation}</${tag}>`;
    });
  } while (html !== previous);

  return html;
}

function buildLangDropdown(config, currentLang) {
  const currentFileName = config.fileName;
  const lines = languages.map((language) => {
    const href = resolveLanguageHref(currentFileName, currentLang, language.code);
    const activeClass = language.code === currentLang ? ' active' : '';
    return `          <a class="lang-option${activeClass}" data-lang="${language.code}" href="${href}" hreflang="${language.code}">\n            <span class="lang-flag">${language.flag}</span>\n            <span>${language.label}</span>\n          </a>`;
  });

  return `<div class="lang-dropdown" id="langDropdown">\n${lines.join('\n')}\n        </div>`;
}

function resolveLanguageHref(fileName, currentLang, targetLang) {
  if (currentLang === 'en') {
    return targetLang === 'en' ? fileName : `${targetLang}/${fileName}`;
  }

  if (targetLang === currentLang) {
    return fileName;
  }

  if (targetLang === 'en') {
    return `../${fileName}`;
  }

  return `../${targetLang}/${fileName}`;
}

function updateUrlMetadata(html, config, languageCode) {
  const pageUrl = languageCode === 'en' ? config.rootUrl : config.localizedUrl(languageCode);
  let result = html.replace(/<link rel="canonical" href="[^"]+">/, `<link rel="canonical" href="${pageUrl}">`);
  result = result.replace(/<meta property="og:url" content="[^"]+">/, `<meta property="og:url" content="${pageUrl}">`);
  return result;
}

function injectAlternateLinks(html, config, languageCode) {
  const alternates = languages.map((language) => {
    const href = language.code === 'en' ? config.rootUrl : config.localizedUrl(language.code);
    return `  <link rel="alternate" hreflang="${language.code}" href="${href}">`;
  });
  alternates.push(`  <link rel="alternate" hreflang="x-default" href="${config.rootUrl}">`);

  return html.replace(
    /<link rel="canonical" href="[^"]+">/,
    (match) => `${match}\n${alternates.join('\n')}`
  );
}

function rewriteRelativeLinks(html, languageCode) {
  if (languageCode === 'en') {
    return html;
  }

  let result = html;
  result = result.replaceAll('href="./favicon.svg"', 'href="../favicon.svg"');
  result = result.replaceAll('href="getting-started.html"', 'href="../getting-started.html"');
  result = result.replaceAll('href="faq.html"', 'href="../faq.html"');
  result = result.replaceAll('href="spec/"', 'href="../spec/"');
  result = result.replaceAll('href="files/', 'href="../files/');
  result = result.replaceAll('src="files/', 'src="../files/');
  return result;
}

function updateLocalizedMedia(html, config, languageCode) {
  if (config.name !== 'index') {
    return html;
  }

  const videoId = languageCode === 'ja' ? 'sbKEKN83mhs' : 'L-dEtjFuuOA';
  return html.replace(/src="https:\/\/www\.youtube\.com\/embed\/[^"]+"/, `src="https://www.youtube.com/embed/${videoId}"`);
}

function stripRuntimeScript(html, runtimeScript) {
  const scriptStart = html.lastIndexOf('<script>');
  const scriptEnd = html.lastIndexOf('</script>');
  if (scriptStart === -1 || scriptEnd === -1 || scriptEnd < scriptStart) {
    throw new Error('Cannot find runtime script block to replace');
  }

  return `${html.slice(0, scriptStart)}${runtimeScript}\n</body>\n</html>\n`;
}

function buildIndexRuntime() {
  return `  <script>\n    document.addEventListener('DOMContentLoaded', () => {\n      const langBtn = document.getElementById('langBtn');\n      const langDropdown = document.getElementById('langDropdown');\n\n      if (langBtn && langDropdown) {\n        langBtn.addEventListener('click', (event) => {\n          event.stopPropagation();\n          langDropdown.classList.toggle('show');\n        });\n\n        document.addEventListener('click', () => {\n          langDropdown.classList.remove('show');\n        });\n      }\n\n      const observer = new IntersectionObserver((entries) => {\n        entries.forEach((entry) => {\n          if (entry.isIntersecting) {\n            entry.target.classList.add('visible');\n          }\n        });\n      }, { root: null, rootMargin: '0px', threshold: 0.1 });\n\n      document.querySelectorAll('.fade-in').forEach((element) => {\n        observer.observe(element);\n      });\n    });\n  </script>`;
}

function buildPatentRuntime() {
  return `  <script>\n    document.addEventListener('DOMContentLoaded', () => {\n      const langBtn = document.getElementById('langBtn');\n      const langDropdown = document.getElementById('langDropdown');\n\n      if (!langBtn || !langDropdown) {\n        return;\n      }\n\n      langBtn.addEventListener('click', (event) => {\n        event.stopPropagation();\n        langDropdown.classList.toggle('show');\n      });\n\n      document.addEventListener('click', () => {\n        langDropdown.classList.remove('show');\n      });\n    });\n  </script>`;
}

function replaceElementById(html, id, replacement) {
  const marker = `id="${id}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Cannot find element with id ${id}`);
  }

  const tagStart = html.lastIndexOf('<', markerIndex);
  const tagNameMatch = /^<([a-zA-Z0-9]+)/.exec(html.slice(tagStart));
  if (!tagNameMatch) {
    throw new Error(`Cannot determine tag name for element ${id}`);
  }

  const tagName = tagNameMatch[1];
  const bounds = findElementBounds(html, tagStart, tagName);
  return `${html.slice(0, bounds.start)}${replacement}${html.slice(bounds.end)}`;
}

function findElementBounds(html, start, tagName) {
  let depth = 0;
  let index = start;

  while (index < html.length) {
    const nextOpen = html.indexOf(`<${tagName}`, index);
    const nextClose = html.indexOf(`</${tagName}>`, index);

    if (nextOpen !== -1 && nextOpen < nextClose) {
      const tagEnd = html.indexOf('>', nextOpen);
      const selfClosing = html[tagEnd - 1] === '/';
      depth += selfClosing ? 0 : 1;
      index = tagEnd + 1;
      continue;
    }

    if (nextClose === -1) {
      throw new Error(`Unclosed tag ${tagName}`);
    }

    depth -= 1;
    index = nextClose + tagName.length + 3;

    if (depth === 0) {
      return { start, end: index };
    }
  }

  throw new Error(`Failed to resolve bounds for tag ${tagName}`);
}

function getLanguage(code) {
  const language = languages.find((entry) => entry.code === code);
  if (!language) {
    throw new Error(`Unsupported language: ${code}`);
  }
  return language;
}

async function writeSitemap() {
  const lastmod = '2026-04-01';
  const urls = [
    { loc: 'https://mcplet.ai/', lastmod },
    { loc: 'https://mcplet.ai/ja/', lastmod },
    { loc: 'https://mcplet.ai/zh/', lastmod },
    { loc: 'https://mcplet.ai/fr/', lastmod },
    { loc: 'https://mcplet.ai/de/', lastmod },
    { loc: 'https://mcplet.ai/es/', lastmod },
    { loc: 'https://mcplet.ai/getting-started.html', lastmod },
    { loc: 'https://mcplet.ai/spec/', lastmod },
    { loc: 'https://mcplet.ai/faq.html', lastmod },
    { loc: 'https://mcplet.ai/patent-notice.html', lastmod },
    { loc: 'https://mcplet.ai/ja/patent-notice.html', lastmod },
    { loc: 'https://mcplet.ai/zh/patent-notice.html', lastmod },
    { loc: 'https://mcplet.ai/fr/patent-notice.html', lastmod },
    { loc: 'https://mcplet.ai/de/patent-notice.html', lastmod },
    { loc: 'https://mcplet.ai/es/patent-notice.html', lastmod },
    { loc: 'https://mcplet.ai/files/MCPlet-spec-v202603-03.md', lastmod: '2026-03-27' }
  ];

  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const entry of urls) {
    lines.push(
      '  <url>',
      `    <loc>${entry.loc}</loc>`,
      `    <lastmod>${entry.lastmod}</lastmod>`,
      '  </url>'
    );
  }
  lines.push('</urlset>');

  await fs.writeFile(path.join(projectRoot, 'sitemap.xml'), `${lines.join('\n')}\n`, 'utf8');
}