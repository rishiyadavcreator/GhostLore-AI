
const $ = (selector) => document.querySelector(selector);

const storyForm = $("#storyForm");
const idea = $("#idea");
const mood = $("#mood");
const length = $("#length");
const story = $("#story");
const actions = $("#actions");
const summon = $("#summon");

let currentStory = null;
let toastTimer;

const MODEL = "qwen2.5:3b";
const API = "http://localhost:11434/api/generate";
const STORAGE_KEY = "ghostlore-stories";

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function getArchive() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setArchive(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  renderArchive();
}

function makeTitle(prompt) {
  return prompt
    .split(/\s+/)
    .slice(0, 7)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Offline demo generator. This is NOT a real AI model.
function demoStory(prompt, atmosphere, size) {
  const openings = [
    "The clock stopped at midnight, but the footsteps continued.",
    "Nobody in the village remembered who built the abandoned house.",
    "A strange letter appeared beneath the door, although nobody lived there."
  ];

  const mysteries = [
    "Behind the locked door, a radio whispered a name that had been forgotten for decades.",
    "Every night, a candle appeared in the empty window. Every morning, it was gone.",
    "A dusty photograph showed someone standing behind the visitor. The room had been empty."
  ];

  const endings = [
    "At sunrise, everything seemed normal. Then the telephone rang, and a familiar voice said, 'You came back.'",
    "They walked away without looking back. In the window, another silhouette watched them leave.",
    "The mystery remained unsolved. But from that night onward, the clock never stopped again."
  ];

  const seed = prompt.length + atmosphere.length;
  const paragraphs = [
    `The story began with this strange mystery: ${prompt}.`,
    openings[seed % openings.length],
    mysteries[(seed + 1) % mysteries.length],
    `The atmosphere grew ${atmosphere}. Even the silence seemed to be waiting for something.`,
    endings[(seed + 2) % endings.length]
  ];

  if (size === "long") {
    paragraphs.splice(
      3, 0,
      "The visitor searched through forgotten journals, old photographs, and letters. Each discovery revealed another fragment of a story that someone had tried to erase. The truth was not frightening because it was supernatural, but because it had been forgotten."
    );
  }

  if (size === "short") {
    return {
      title: makeTitle(prompt),
      body: `${paragraphs[0]}\n\n${paragraphs[1]}\n\n${paragraphs[4]}`,
      source: "OFFLINE DEMO"
    };
  }

  return {
    title: makeTitle(prompt),
    body: paragraphs.join("\n\n"),
    source: "OFFLINE DEMO"
  };
}

// Real open-weight model through the Ollama local API.
async function askLocalModel(prompt, systemPrompt) {
  const response = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      system: systemPrompt,
      prompt,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error("Local AI service is unavailable.");
  }

  const data = await response.json();

  if (!data.response) {
    throw new Error("The AI returned an empty response.");
  }

  return data.response.trim();
}

function displayStory(result) {
  currentStory = {
    ...result,
    createdAt: new Date().toISOString()
  };

  story.innerHTML = `
    <p class="story-meta">
      ${escapeHTML(result.source)} ·
      ${new Date(currentStory.createdAt).toLocaleString()}
    </p>
    <h3 class="story-title">${escapeHTML(result.title)}</h3>
    <div class="story-body">${escapeHTML(result.body)}</div>
  `;

  actions.hidden = false;
}

function parseAIStory(text, fallbackTitle) {
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  let title = fallbackTitle;

  if (lines.length && lines[0].length < 100) {
    title = lines.shift().replace(/^#+\s*/, "").replace(/^title:\s*/i, "");
  }

  return {
    title,
    body: lines.join("\n\n") || text,
    source: `LOCAL OPEN-WEIGHT MODEL · ${MODEL}`
  };
}

storyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = idea.value.trim();

  if (!prompt) {
    notify("Enter an idea for your story first.");
    return;
  }

  summon.disabled = true;
  summon.textContent = "✧ LISTENING TO THE DARK...";

  story.innerHTML = `
    <p class="story-meta">THE MACHINE IS LISTENING...</p>
    <p class="story-body">Something is writing in the darkness...</p>
  `;

  actions.hidden = true;

  try {
    const result = await askLocalModel(
      `Story idea: ${prompt}\nAtmosphere: ${mood.value}\nLength: ${length.value}. Give the story a title on the first line.`,
      "You are GhostLore, a creative horror and folklore writer. Write original, atmospheric spooky fiction suitable for a general audience. Do not claim to contact actual spirits or deceased people."
    );

    displayStory(parseAIStory(result, makeTitle(prompt)));
    notify("Story generated using your local model.");
  } catch (error) {
    displayStory({
      ...demoStory(prompt, mood.value, length.value),
      prompt
    });

    notify("Local AI unavailable. Showing the demo story.");
  } finally {
    summon.disabled = false;
    summon.textContent = "✧ SUMMON STORY ↗";
  }
});

// Clear story chamber
$("#storyForm").addEventListener("reset", () => {
  currentStory = null;
  actions.hidden = true;
});

// Save story to this browser
$("#save").addEventListener("click", () => {
  if (!currentStory) return;

  const archive = getArchive();

  archive.unshift({
    ...currentStory,
    id: Date.now()
  });

  setArchive(archive.slice(0, 30));
  notify("Story saved on this device.");
});

// Copy story
$("#copy").addEventListener("click", async () => {
  if (!currentStory) return;

  try {
    await navigator.clipboard.writeText(
      `${currentStory.title}\n\n${currentStory.body}`
    );

    notify("Story copied!");
  } catch {
    notify("Copy unavailable. Try downloading instead.");
  }
});

// Download story as a text file
$("#download").addEventListener("click", () => {
  if (!currentStory) return;

  const content =
    `${currentStory.title}\n\n${currentStory.body}\n\nSource: ${currentStory.source}`;

  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" })
  );

  const link = document.createElement("a");
  link.href = url;
  link.download = "ghostlore-story.txt";
  link.click();

  URL.revokeObjectURL(url);
});

// Haunted terminal
const terminal = $("#terminal");

function addTerminalLine(className, text) {
  const line = document.createElement("p");
  line.className = className;
  line.textContent = text;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

$("#terminalForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const input = $("#question");
  const question = input.value.trim();

  if (!question) return;

  addTerminalLine("user-line", `you@local:~$ ${question}`);
  input.value = "";

  const waiting = document.createElement("p");
  waiting.textContent = "The unseen is composing a reply...";
  terminal.appendChild(waiting);

  try {
    const reply = await askLocalModel(
      question,
      "You are a fictional spooky terminal companion. Reply in one to three concise, eerie but friendly sentences. Do not claim to contact real spirits or know hidden facts."
    );

    waiting.remove();
    addTerminalLine("", `ghost@local:~$ ${reply}`);
  } catch {
    const replies = [
      "The oldest door may be the one inside your memory.",
      "Some mysteries are waiting for the right question.",
      "The clock says now. The shadows suggest otherwise.",
      "A forgotten story is a room with the lights still on.",
      "Even a silent machine has a history."
    ];

    waiting.remove();

    addTerminalLine(
      "",
      `ghost@local:~$ ${replies[question.length % replies.length]} [demo reply]`
    );
  }
});

$("#resetTerminal").addEventListener("click", () => {
  terminal.innerHTML = `
    <p class="green">ghostlore@local:~$ connection reset</p>
    <p>The quiet is listening...</p>
  `;
});

// Render archive
function renderArchive() {
  const archive = getArchive();
  const list = $("#archive");

  $("#count").textContent = archive.length;
  list.replaceChildren();

  if (!archive.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No stories saved yet.";
    list.appendChild(empty);
    return;
  }

  archive.forEach(item => {
    const row = document.createElement("div");
    row.className = "archive-item";

    const open = document.createElement("button");
    open.className = "archive-open";
    open.textContent = item.title;

    open.addEventListener("click", () => {
      currentStory = item;

      story.innerHTML = `
        <p class="story-meta">${escapeHTML(item.source)}</p>
        <h3 class="story-title">${escapeHTML(item.title)}</h3>
        <div class="story-body">${escapeHTML(item.body)}</div>
      `;

      actions.hidden = false;
      story.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const remove = document.createElement("button");
    remove.className = "archive-delete";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Delete saved story");

    remove.addEventListener("click", () => {
      setArchive(getArchive().filter(s => s.id !== item.id));
      notify("Story removed from archive.");
    });

    row.append(open, remove);
    list.appendChild(row);
  });
}

$("#clearArchive").addEventListener("click", () => {
  if (!getArchive().length) {
    notify("Your archive is already empty.");
    return;
  }

  if (confirm("Delete all saved stories from this browser?")) {
    setArchive([]);
    notify("Archive cleared.");
  }
});

renderArchive();
