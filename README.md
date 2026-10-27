# www.rezab.eu — Jekyll

Web se sestavuje Jekyllem 4.4 z Markdown příspěvků. Zachovává vzhled původního blogu, adresy čtyř aktuálních článků, About a místní obrázky i fonty. WordPress ani původní hosting k provozu nepotřebuje.

## Lokální náhled v Dockeru

```powershell
docker compose up --build -d web
```

Otevřete http://localhost:8080. Docker nejprve sestaví Markdown pomocí Jekyllu a hotový web potom obsluhuje Nginx. Po změně příspěvků spusťte stejný příkaz znovu.

Pro průběžné psaní s automatickým přegenerováním:

```powershell
docker compose --profile dev up --build -d jekyll
```

Otevřete http://localhost:4000. Soubory projektu jsou připojené do kontejneru; po uložení `.md` se web přegeneruje a stačí obnovit stránku v prohlížeči. Po změně `_config.yml` restartujte službu příkazem `docker compose restart jekyll`.

Oba náhledy jsou dostupné pouze z tohoto počítače. Zastavení:

```powershell
docker compose --profile dev down
```

## Nový článek

Zkopírujte `_templates/post.md` do `_posts/` a pojmenujte například `2026-10-27-novy-clanek.md`. Upravte metadata mezi `---` a pod ně napište Markdown:

```markdown
---
title: "Nový článek"
categories: [Intune]
tags: [PowerShell, Security]
description: "Krátký úvod zobrazený na přehledu článků."
---

Úvodní odstavec s **tučným textem**.

## První sekce

Text článku.

![Popis obrázku](/assets/img/novy-clanek/obrazek.png)
```

Obrázek uložte do odpovídající složky `assets/img/`. Volitelné metadata `image: /assets/img/novy-clanek/uvodni-obrazek.png` přidají obrázek také na úvodní stránku. Pro bloky PowerShellu používejte oplocené bloky s označením `powershell`.

Jekyll automaticky vytvoří stránku článku a zařadí ho na úvod, do kategorií a štítků, vyhledávání, RSS a sitemapy. Kategorie a štítky se tvoří z metadat; žádné archivní HTML se ručně nepřidává. Datum se načítá z názvu souboru. Výchozí adresa vychází z kategorie, data a názvu; pomocí `permalink: /moje-adresa/` ji lze určit výslovně. Původní importované články mají explicitní `permalink`, který zachovává jejich adresy.

Dočasně nepublikovaný příspěvek může mít `published: false`. Budoucí data se standardně nezobrazují. Koncepty patří do `_drafts/`.

Pro automatický obsah delšího článku lze před nadpisy vložit:

```markdown
<details class="table-of-contents" open markdown="1">
<summary>Page Contents</summary>

* Contents
{:toc}

</details>
```

## Struktura

- `_posts/*.md`: čtyři aktuální články; hlavní zdroj obsahu.
- `about.markdown`: stránka About.
- `_layouts/`, `_includes/`: sdílené Liquid šablony, vzhled a přehled článků.
- `_plugins/archives.rb`: automatické generování kategorií a štítků.
- `assets/`: vlastní CSS, JavaScript a prostor pro nové obrázky.
- `assets/images/`: obrázky převzaté z původního webu.
- `assets/fonts/`: lokální fonty.
- `assets/css/blocks/`: zachované styly bloků původního vzhledu.
- `search.json`, `feed/`, `sitemap.xml`: Liquid šablony aktualizované při sestavení.
- `_site/`: generovaný výstup, ignorovaný Gitem; neupravovat ručně.
- `_legacy/posts/`: záloha starších článků ze vstupního repozitáře, které nebyly na aktuálním webu. Nejsou publikované.
- `content/`: původní veřejný WordPress export, pouze referenční záloha; Jekyll jej k sestavení nepotřebuje.

Veřejný web obsahuje statické HTML. Vyhledávání využívá index sestavený z Markdownu. Analytické a reklamní skripty původního WordPressu nejsou součástí šablon.

## Ověření

S Ruby 3.3 a Bundlerem lze sestavovat i bez Dockeru:

```powershell
bundle install
bundle exec jekyll build --trace
node scripts/verify.mjs
ruby scripts/test-jekyll.rb
```

`verify.mjs` kontroluje vygenerované stránky, vnitřní odkazy a kotvy, obrázky a CSS zdroje. Volba `--url=http://localhost:8080` navíc kontroluje HTTP odpovědi a stav 404; předtím je nutné mít aktuální `_site/`.

`test-jekyll.rb` sestaví izolovanou dočasnou kopii s novým Markdown příspěvkem a ověří jeho automatické zahrnutí do úvodu, kategorií, štítků, vyhledávání, RSS a sitemapy. Testovací článek se do skutečného `_posts/` neukládá. Test lze spustit v Docker prostředí:

```powershell
docker compose --profile dev run --rm jekyll ruby scripts/test-jekyll.rb
```

## GitHub Pages

Workflow `.github/workflows/pages.yml` instaluje Ruby knihovny podle `Gemfile.lock`, sestaví Jekyll, ověří výsledek a publikuje `_site/`. Pro vlastní generátor archivů je potřeba mít v **Settings → Pages → Source** nastavené **GitHub Actions**.

Web se publikuje na `https://rezabj.github.io/`. RSS, sitemap a kanonické adresy používají `url` z `_config.yml`, nyní `https://rezabj.github.io`. Pro pozdější přechod na vlastní doménu změňte tuto hodnotu na `https://www.rezab.eu`, přidejte do kořene repozitáře soubor `CNAME` s hodnotou `www.rezab.eu` a nastavte doménu a HTTPS v GitHub Pages. DNS původní domény zatím zůstává beze změny.
