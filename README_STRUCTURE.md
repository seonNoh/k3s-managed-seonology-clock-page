# README structure contract

`README.md`, `README.ko.md`, and `README.ja.md` are first-class documents. Each file keeps one H1, the same language switcher, eight H2 sections in the same order, four localized SVG links, and two byte-identical fenced command blocks.

The four diagram subjects are runtime architecture, tool landscape, Gitea delivery, and live security boundaries. Each subject has English, Korean, and Japanese files under `docs/svg/`, for twelve self-contained Relief SVG files in total. Every SVG includes one `<title>`, one `<desc>`, reduced-motion support, unique IDs, and a stable pedia record.

```sh
python3 verify.py --repository .
```
