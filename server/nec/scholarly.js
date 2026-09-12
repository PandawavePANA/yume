// 특허 탐색 실행부(140) 중 학술·서지 식별자 담당. 전부 인증키가 필요 없는 공개 API다.
const TIMEOUT_MS = 8000;
const UA = { "User-Agent": "YUME-FactCheck/1.0 (mailto:reamer@d-reamer.com)" };

async function getJson(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, data: res.status === 200 ? await res.json().catch(() => null) : null };
}

// doi.org 핸들 API: responseCode 1 = 등록됨, 100 = 핸들 없음.
export async function lookupDoi(doi) {
  try {
    const { status, data } = await getJson(`https://doi.org/api/handles/${encodeURIComponent(doi)}`);
    if (status === 404 || data?.responseCode === 100) return { ok: true, found: false };
    if (data?.responseCode !== 1) return { ok: false, error: `doi.org 응답 ${status}` };
    let title = null;
    try {
      const cr = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
      title = cr.data?.message?.title?.[0] || null;
    } catch {
      /* 제목은 부가 정보 */
    }
    return { ok: true, found: true, title, url: `https://doi.org/${doi}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function lookupArxiv(id) {
  try {
    const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`, {
      headers: UA,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `arXiv 응답 ${res.status}` };
    const xml = await res.text();
    const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1] || "";
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim();
    const idTag = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] || "";
    if (!entry || !title || /^Error$/i.test(title) || !idTag.includes("arxiv.org/abs/")) return { ok: true, found: false };
    return { ok: true, found: true, title, url: `https://arxiv.org/abs/${id}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function lookupPmid(pmid) {
  try {
    const { status, data } = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`);
    if (status !== 200 || !data) return { ok: false, error: `PubMed 응답 ${status}` };
    const doc = data.result?.[pmid];
    if (!doc || doc.error) return { ok: true, found: false };
    return { ok: true, found: true, title: doc.title || null, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function lookupIsbn(isbn) {
  try {
    const { status, data } = await getJson(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
    if (status === 404) return { ok: true, found: false };
    if (status !== 200 || !data) return { ok: false, error: `Open Library 응답 ${status}` };
    return { ok: true, found: true, title: data.title || null, url: `https://openlibrary.org/isbn/${isbn}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export const SCHOLARLY_LOOKUP = {
  doi: { fn: lookupDoi, source: "doi.org", label: "DOI" },
  arxiv: { fn: lookupArxiv, source: "arxiv.org", label: "arXiv" },
  pmid: { fn: lookupPmid, source: "pubmed", label: "PubMed" },
  isbn: { fn: lookupIsbn, source: "openlibrary", label: "ISBN" },
};
