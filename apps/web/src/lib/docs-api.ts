/** The planned base URL of the API. It does not answer yet; the page says so. */
export const API_BASE_URL = 'https://api.mochifile.com'

export type ExampleLanguage = 'curl' | 'js' | 'python'

/** The languages of an example, in the order of the tabs. `label` is the tab's name. */
export const exampleLanguages = [
  { key: 'curl', label: 'cURL' },
  { key: 'js', label: 'JavaScript' },
  { key: 'python', label: 'Python' },
] as const satisfies ReadonlyArray<{ key: ExampleLanguage; label: string }>

export type Example = Record<ExampleLanguage, string>

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/**
 * Code as HTML with its comments and strings wrapped in spans. All of the text is escaped
 * first-hand, so the result is safe for `set:html`. Only what the examples use is recognised:
 * `#` and `//` comments, and quoted strings.
 */
export function highlightCode(code: string): string {
  const token = /(^[ \t]*(?:#|\/\/).*$)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/gm
  let html = ''
  let last = 0
  for (const match of code.matchAll(token)) {
    html += escapeHtml(code.slice(last, match.index))
    const [text = '', comment] = match
    html += `<span class="${comment ? 'code-c' : 'code-s'}">${escapeHtml(text)}</span>`
    last = match.index + text.length
  }
  return html + escapeHtml(code.slice(last))
}

/**
 * Text with `code` between backticks as HTML: the code becomes `<code>`, everything else is
 * escaped. For messages, which carry no markup of their own.
 */
export function inlineCode(text: string): string {
  return text
    .split('`')
    .map((part, index) => (index % 2 === 1 ? `<code>${escapeHtml(part)}</code>` : escapeHtml(part)))
    .join('')
}

const url = (path: string) => `${API_BASE_URL}${path}`

/** `POST /v1/images/compress`: a photo under 50 KB, kept as JPG. */
export function compressExample(comment: string): Example {
  return {
    curl: `# ${comment}
curl -X POST "${url('/v1/images/compress?maxSize=50kb&format=jpg')}" \\
  -H "Authorization: Bearer $MOCHIFILE_KEY" \\
  --data-binary @photo.jpg \\
  -o photo-50kb.jpg`,
    js: `// ${comment}
import { readFile, writeFile } from 'node:fs/promises'

const response = await fetch(
  '${url('/v1/images/compress?maxSize=50kb&format=jpg')}',
  {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.MOCHIFILE_KEY },
    body: await readFile('photo.jpg'),
  },
)
if (!response.ok) throw new Error('Mochifile answered ' + response.status)
await writeFile('photo-50kb.jpg', Buffer.from(await response.arrayBuffer()))`,
    python: `# ${comment}
import os
import requests

with open("photo.jpg", "rb") as photo:
    response = requests.post(
        "${url('/v1/images/compress')}",
        params={"maxSize": "50kb", "format": "jpg"},
        headers={"Authorization": "Bearer " + os.environ["MOCHIFILE_KEY"]},
        data=photo,
    )
response.raise_for_status()
with open("photo-50kb.jpg", "wb") as result:
    result.write(response.content)`,
  }
}

/** `POST /v1/images/convert`: a WebP turned into a JPG. */
export function convertExample(comment: string): Example {
  return {
    curl: `# ${comment}
curl -X POST "${url('/v1/images/convert?format=jpg')}" \\
  -H "Authorization: Bearer $MOCHIFILE_KEY" \\
  --data-binary @photo.webp \\
  -o photo.jpg`,
    js: `// ${comment}
import { readFile, writeFile } from 'node:fs/promises'

const response = await fetch('${url('/v1/images/convert?format=jpg')}', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + process.env.MOCHIFILE_KEY },
  body: await readFile('photo.webp'),
})
if (!response.ok) throw new Error('Mochifile answered ' + response.status)
await writeFile('photo.jpg', Buffer.from(await response.arrayBuffer()))`,
    python: `# ${comment}
import os
import requests

with open("photo.webp", "rb") as photo:
    response = requests.post(
        "${url('/v1/images/convert')}",
        params={"format": "jpg"},
        headers={"Authorization": "Bearer " + os.environ["MOCHIFILE_KEY"]},
        data=photo,
    )
response.raise_for_status()
with open("photo.jpg", "wb") as result:
    result.write(response.content)`,
  }
}

/** `POST /v1/pdfs/merge`: three photos in one PDF. */
export function mergeExample(comment: string): Example {
  return {
    curl: `# ${comment}
curl -X POST "${url('/v1/pdfs/merge')}" \\
  -H "Authorization: Bearer $MOCHIFILE_KEY" \\
  -F file=@front.jpg -F file=@back.jpg -F file=@selfie.jpg \\
  -o documents.pdf`,
    js: `// ${comment}
import { readFile, writeFile } from 'node:fs/promises'

const form = new FormData()
for (const name of ['front.jpg', 'back.jpg', 'selfie.jpg']) {
  form.append('file', new Blob([await readFile(name)]), name)
}
const response = await fetch('${url('/v1/pdfs/merge')}', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + process.env.MOCHIFILE_KEY },
  body: form,
})
if (!response.ok) throw new Error('Mochifile answered ' + response.status)
await writeFile('documents.pdf', Buffer.from(await response.arrayBuffer()))`,
    python: `# ${comment}
import os
import requests

names = ("front.jpg", "back.jpg", "selfie.jpg")
files = [("file", open(name, "rb")) for name in names]
response = requests.post(
    "${url('/v1/pdfs/merge')}",
    headers={"Authorization": "Bearer " + os.environ["MOCHIFILE_KEY"]},
    files=files,
)
response.raise_for_status()
with open("documents.pdf", "wb") as result:
    result.write(response.content)`,
  }
}

/** `GET /v1/jobs/{id}`: the state of a request. */
export const jobsExample: Example = {
  curl: `curl "${url('/v1/jobs/$JOB_ID')}" \\
  -H "Authorization: Bearer $MOCHIFILE_KEY"`,
  js: `const response = await fetch('${url('/v1/jobs/')}' + jobId, {
  headers: { Authorization: 'Bearer ' + process.env.MOCHIFILE_KEY },
})
console.log(await response.json())`,
  python: `import os
import requests

response = requests.get(
    "${url('/v1/jobs/')}" + job_id,
    headers={"Authorization": "Bearer " + os.environ["MOCHIFILE_KEY"]},
)
print(response.json())`,
}

/** What `GET /v1/jobs/{id}` answers, as the design draws it. */
export const jobsResponse = `{
  "id": "job-id",
  "status": "done"
}`
