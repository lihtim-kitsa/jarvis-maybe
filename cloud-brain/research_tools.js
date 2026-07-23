import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { parseStringPromise } from 'xml2js';

const PDF_STORAGE_DIR = 'C:\\Users\\astik\\OneDrive\\Desktop\\jarvis-gen-pdfs';

// Ensure PDF storage directory exists
if (!fs.existsSync(PDF_STORAGE_DIR)) {
  fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
}

export async function search_arxiv({ query, category, date_range }) {
  try {
    let url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}`;
    if (category) {
       url = `http://export.arxiv.org/api/query?search_query=cat:${encodeURIComponent(category)}+AND+all:${encodeURIComponent(query)}`;
    }
    url += '&sortBy=submittedDate&sortOrder=descending&max_results=5';

    const res = await fetch(url);
    const xml = await res.text();
    
    const result = await parseStringPromise(xml);
    const entries = result.feed?.entry;
    
    if (!entries || entries.length === 0) {
      return { status: 'No results found on arXiv.' };
    }

    const papers = [];
    for (const entry of entries) {
      const idStr = entry.id[0];
      const arxiv_id = idStr.split('/abs/')[1];
      const title = entry.title[0].trim().replace(/\s+/g, ' ');
      const abstract = entry.summary[0].trim().replace(/\s+/g, ' ');
      const authors = entry.author ? entry.author.map(a => a.name[0]).join(', ') : '';
      const published = entry.published[0];
      
      let pdf_link = '';
      const links = entry.link || [];
      for (const link of links) {
        if (link.$ && link.$.title === 'pdf') {
          pdf_link = link.$.href;
        }
      }

      let full_text_path = '';
      if (pdf_link) {
        try {
          const pdfRes = await fetch(pdf_link);
          const buffer = await pdfRes.arrayBuffer();
          const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
          const fileName = `${arxiv_id.replace(/\./g, '_')}_${safeTitle}.pdf`;
          full_text_path = path.join(PDF_STORAGE_DIR, fileName);
          fs.writeFileSync(full_text_path, Buffer.from(buffer));
        } catch (e) {
          console.error(`Failed to download PDF for ${arxiv_id}:`, e.message);
        }
      }

      papers.push({ title, authors, arxiv_id, abstract, published, pdf_link, full_text_path });
    }

    return { papers };
  } catch (e) {
    return { error: `arXiv search failed: ${e.message}` };
  }
}

export async function search_semantic_scholar({ query }) {
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=5&fields=title,authors,abstract,year,citationCount,influentialCitationCount,externalIds`;
    
    const headers = {};
    if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
      headers['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      return { error: `Semantic Scholar API returned ${res.status} ${res.statusText}. Rate limit exceeded or bad request.` };
    }
    const data = await res.json();
    
    if (!data.data || data.data.length === 0) {
      return { status: 'No results found on Semantic Scholar.' };
    }

    const papers = data.data.map(p => ({
      title: p.title,
      authors: p.authors ? p.authors.map(a => a.name).join(', ') : '',
      abstract: p.abstract || '',
      year: p.year,
      citationCount: p.citationCount,
      influentialCitationCount: p.influentialCitationCount,
      arxiv_id: p.externalIds && p.externalIds.ArXiv ? p.externalIds.ArXiv : null,
      paper_id: p.paperId
    }));

    return { papers };
  } catch (e) {
    return { error: `Semantic Scholar search failed: ${e.message}` };
  }
}

export async function get_citation_graph({ paper_id }) {
  try {
    const headers = {};
    if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
      headers['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY;
    }

    // Citations
    const citUrl = `https://api.semanticscholar.org/graph/v1/paper/${paper_id}/citations?limit=10&fields=title,authors,abstract,year,citationCount`;
    const citRes = await fetch(citUrl, { headers });
    const citData = citRes.ok ? await citRes.json() : { data: [] };

    // References
    const refUrl = `https://api.semanticscholar.org/graph/v1/paper/${paper_id}/references?limit=10&fields=title,authors,abstract,year,citationCount`;
    const refRes = await fetch(refUrl, { headers });
    const refData = refRes.ok ? await refRes.json() : { data: [] };

    const formatPaper = p => {
      const paper = p.citingPaper || p.citedPaper;
      if (!paper) return null;
      return {
        title: paper.title,
        authors: paper.authors ? paper.authors.map(a => a.name).join(', ') : '',
        abstract: paper.abstract,
        year: paper.year,
        citationCount: paper.citationCount,
        paper_id: paper.paperId
      };
    };

    return {
      citations: citData.data ? citData.data.map(formatPaper).filter(Boolean) : [],
      references: refData.data ? refData.data.map(formatPaper).filter(Boolean) : []
    };
  } catch (e) {
    return { error: `Failed to fetch citation graph: ${e.message}` };
  }
}

export async function browse_and_extract({ url }) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    const title = await page.title();
    
    const extractedData = await page.evaluate(() => {
      const selectors = ['abstract', '.abstract', '#abstract', 'meta[name="citation_abstract"]'];
      let abstract = '';
      for (const sel of selectors) {
        if (sel.startsWith('meta')) {
          const meta = document.querySelector(sel);
          if (meta) {
             abstract = meta.content;
             break;
          }
        } else {
          const el = document.querySelector(sel);
          if (el) {
            abstract = el.innerText;
            break;
          }
        }
      }
      
      if (!abstract) {
        const pTags = Array.from(document.querySelectorAll('p'));
        abstract = pTags.map(p => p.innerText).join('\\n').substring(0, 1500) + '...';
      }

      return { abstract };
    });

    return {
      url,
      title,
      abstract: extractedData.abstract
    };
  } catch (e) {
    return { error: `Failed to browse and extract from URL: ${e.message}` };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
