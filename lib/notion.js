// Notion API helpers — used by popup.js
// OAuth flow is handled in service-worker.js

const NOTION_VERSION = "2022-06-28";

function notionHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION
  };
}

const NotionAPI = {
  async disconnect() {
    await chrome.storage.local.remove(["notionToken", "notionWorkspace", "notionDatabaseId", "notionParentPageId"]);
  },

  // Get or set the root parent page (stored so all exports go to the same place)
  async getParentPageId(token) {
    // Check if we already stored one
    const store = await chrome.storage.local.get("notionParentPageId");
    if (store.notionParentPageId) {
      return store.notionParentPageId;
    }

    // Search for top-level pages the user shared
    const res = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify({
        filter: { value: "page", property: "object" },
        page_size: 20
      })
    });
    const data = await res.json();

    // Find a page whose parent is a workspace (top-level page)
    const topLevel = data.results.find((p) => p.parent?.type === "workspace");
    const page = topLevel || data.results[0];

    if (!page) {
      throw new Error("No Notion pages found. Please share at least one page with the integration.");
    }

    await chrome.storage.local.set({ notionParentPageId: page.id });
    return page.id;
  },

  // ===== Template 1: Vocabulary Database =====
  async exportDatabase(token, favorites) {
    const parentId = await this.getParentPageId(token);

    // Find or create database
    const searchRes = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify({ filter: { value: "database", property: "object" }, page_size: 50 })
    });
    const searchData = await searchRes.json();
    let dbId = searchData.results.find((db) =>
      db.title?.[0]?.plain_text === "AI Translate Favorites"
    )?.id;

    if (!dbId) {
      const createRes = await fetch("https://api.notion.com/v1/databases", {
        method: "POST",
        headers: notionHeaders(token),
        body: JSON.stringify({
          parent: { type: "page_id", page_id: parentId },
          title: [{ type: "text", text: { content: "AI Translate Favorites" } }],
          properties: {
            "Source": { title: {} },
            "Translation": { rich_text: {} },
            "Pronunciation": { rich_text: {} },
            "Definition": { rich_text: {} },
            "Example": { rich_text: {} },
            "CEFR": { select: { options: [
              { name: "A1", color: "green" }, { name: "A2", color: "green" },
              { name: "B1", color: "orange" }, { name: "B2", color: "orange" },
              { name: "C1", color: "purple" }, { name: "C2", color: "purple" }
            ]}},
            "Type": { select: { options: [
              { name: "word", color: "blue" }, { name: "sentence", color: "default" }
            ]}},
            "Lookups": { number: {} },
            "Date": { date: {} }
          }
        })
      });
      if (!createRes.ok) throw new Error("Failed to create database");
      dbId = (await createRes.json()).id;
    }

    let exported = 0;
    for (const fav of favorites) {
      const props = {
        "Source": { title: [{ text: { content: fav.sourceText } }] },
        "Translation": { rich_text: [{ text: { content: fav.translation || "" } }] },
        "Type": { select: { name: fav.type || "word" } },
        "Lookups": { number: fav.lookupCount || 1 },
        "Date": { date: { start: fav.timestamp } }
      };
      if (fav.pronunciation) props["Pronunciation"] = { rich_text: [{ text: { content: fav.pronunciation } }] };
      if (fav.definition) props["Definition"] = { rich_text: [{ text: { content: fav.definition } }] };
      if (fav.example) {
        const ex = fav.exampleTranslation ? `${fav.example}\n${fav.exampleTranslation}` : fav.example;
        props["Example"] = { rich_text: [{ text: { content: ex } }] };
      }
      if (fav.cefr && fav.cefr !== "null") props["CEFR"] = { select: { name: fav.cefr } };

      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: notionHeaders(token),
        body: JSON.stringify({ parent: { database_id: dbId }, properties: props })
      });
      if (res.ok) exported++;
    }
    return exported;
  },

  // ===== Template 2: Study Report =====
  async exportReport(token, favorites) {
    const parentId = await this.getParentPageId(token);
    const now = new Date().toLocaleDateString();

    // Build statistics
    const words = favorites.filter((f) => f.type === "word");
    const sentences = favorites.filter((f) => f.type === "sentence");
    const cefrCounts = {};
    const topLookups = [...favorites].sort((a, b) => (b.lookupCount || 1) - (a.lookupCount || 1)).slice(0, 10);

    for (const f of words) {
      if (f.cefr && f.cefr !== "null") {
        cefrCounts[f.cefr] = (cefrCounts[f.cefr] || 0) + 1;
      }
    }

    const children = [];

    // Summary
    children.push(block("heading_2", "Summary"));
    children.push(block("paragraph", `Total items: ${favorites.length}`));
    children.push(block("paragraph", `Words / Phrases: ${words.length}`));
    children.push(block("paragraph", `Sentences / Paragraphs: ${sentences.length}`));
    children.push(block("divider"));

    // CEFR Distribution
    children.push(block("heading_2", "CEFR Distribution"));
    const cefrOrder = ["A1", "A2", "B1", "B2", "C1", "C2"];
    if (Object.keys(cefrCounts).length > 0) {
      const maxCount = Math.max(...Object.values(cefrCounts));
      for (const level of cefrOrder) {
        const count = cefrCounts[level] || 0;
        if (count === 0) continue;
        const barLen = Math.round((count / maxCount) * 20);
        const bar = "\u2588".repeat(barLen) + "\u2591".repeat(20 - barLen);
        children.push(block("paragraph", `${level}  ${bar}  ${count} words`));
      }
    } else {
      children.push(block("paragraph", "No CEFR data available yet."));
    }
    children.push(block("divider"));

    // Frequency ranking
    children.push(block("heading_2", "Most Looked Up"));
    for (const f of topLookups) {
      const cefrTag = f.cefr && f.cefr !== "null" ? ` [${f.cefr}]` : "";
      children.push(block("bulleted_list_item",
        `${f.sourceText} \u2192 ${f.translation}  (${f.lookupCount || 1}x)${cefrTag}`
      ));
    }
    children.push(block("divider"));

    // Vocabulary by CEFR level
    children.push(block("heading_2", "Vocabulary by Level"));
    for (const level of cefrOrder) {
      const levelWords = words.filter((f) => f.cefr === level);
      if (levelWords.length === 0) continue;
      children.push(block("heading_3", `${level} (${levelWords.length})`));
      for (const w of levelWords) {
        const pron = w.pronunciation ? `  ${w.pronunciation}` : "";
        children.push(block("bulleted_list_item", `${w.sourceText} \u2192 ${w.translation}${pron}`));
      }
    }

    // Uncategorized words
    const noLevel = words.filter((f) => !f.cefr || f.cefr === "null");
    if (noLevel.length > 0) {
      children.push(block("heading_3", `Uncategorized (${noLevel.length})`));
      for (const w of noLevel) {
        children.push(block("bulleted_list_item", `${w.sourceText} \u2192 ${w.translation}`));
      }
    }

    // Sentences
    if (sentences.length > 0) {
      children.push(block("divider"));
      children.push(block("heading_2", "Sentences & Paragraphs"));
      for (const s of sentences) {
        children.push(block("quote", `${s.sourceText}\n\u2192 ${s.translation}`));
      }
    }

    // Create page (max 100 blocks per request)
    const chunks = [];
    for (let i = 0; i < children.length; i += 100) {
      chunks.push(children.slice(i, i + 100));
    }

    const pageRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify({
        parent: { type: "page_id", page_id: parentId },
        properties: { title: { title: [{ text: { content: `AI Translate Report \u2014 ${now}` } }] } },
        children: chunks[0] || []
      })
    });
    if (!pageRes.ok) {
      const err = await pageRes.text();
      throw new Error(`Failed to create report: ${err}`);
    }
    const page = await pageRes.json();

    for (let i = 1; i < chunks.length; i++) {
      await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
        method: "PATCH",
        headers: notionHeaders(token),
        body: JSON.stringify({ children: chunks[i] })
      });
    }

    return favorites.length;
  },

  // ===== Template 3: Flashcard Mode =====
  // Each word becomes a toggle block: click to reveal answer
  async exportFlashcards(token, favorites) {
    const parentId = await this.getParentPageId(token);
    const now = new Date().toLocaleDateString();
    const words = favorites.filter((f) => f.type === "word");

    if (words.length === 0) throw new Error("No words/phrases to export as flashcards.");

    // Group by CEFR
    const cefrOrder = ["A1", "A2", "B1", "B2", "C1", "C2", ""];
    const grouped = {};
    for (const w of words) {
      const level = (w.cefr && w.cefr !== "null") ? w.cefr : "";
      if (!grouped[level]) grouped[level] = [];
      grouped[level].push(w);
    }

    const children = [];
    children.push(block("paragraph", `${words.length} flashcards \u2014 click each word to reveal the answer.`));
    children.push(block("divider"));

    for (const level of cefrOrder) {
      const group = grouped[level];
      if (!group || group.length === 0) continue;

      const label = level || "Other";
      children.push(block("heading_2", `${label} (${group.length})`));

      for (const w of group) {
        // Build answer lines
        const answerLines = [];
        answerLines.push(`${w.translation}`);
        if (w.pronunciation) answerLines.push(w.pronunciation);
        if (w.definition) answerLines.push(w.definition);
        if (w.example) {
          const ex = w.exampleTranslation ? `${w.example} \u2014 ${w.exampleTranslation}` : w.example;
          answerLines.push(ex);
        }

        // Toggle block: heading = word, content = answer
        children.push({
          object: "block",
          type: "toggle",
          toggle: {
            rich_text: [{ type: "text", text: { content: w.sourceText } }],
            children: answerLines.map((line) => block("paragraph", line))
          }
        });
      }
    }

    // Create page
    const chunks = [];
    for (let i = 0; i < children.length; i += 100) {
      chunks.push(children.slice(i, i + 100));
    }

    const pageRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify({
        parent: { type: "page_id", page_id: parentId },
        properties: { title: { title: [{ text: { content: `Flashcards \u2014 ${now}` } }] } },
        children: chunks[0] || []
      })
    });
    if (!pageRes.ok) {
      const err = await pageRes.text();
      throw new Error(`Failed to create flashcards: ${err}`);
    }
    const page = await pageRes.json();

    for (let i = 1; i < chunks.length; i++) {
      await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
        method: "PATCH",
        headers: notionHeaders(token),
        body: JSON.stringify({ children: chunks[i] })
      });
    }

    return words.length;
  }
};

// Helper to create Notion blocks
function block(type, text) {
  if (type === "divider") {
    return { object: "block", type: "divider", divider: {} };
  }
  if (type === "quote") {
    return {
      object: "block", type: "quote",
      quote: { rich_text: [{ type: "text", text: { content: text } }] }
    };
  }
  return {
    object: "block", type,
    [type]: { rich_text: [{ type: "text", text: { content: text } }] }
  };
}
