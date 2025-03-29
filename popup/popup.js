const SAVED_SONGS_DB_KEY = "songs";

class SongItem extends HTMLElement {
  // static get observedAttributes() {
  //   return ['title', 'subtext', 'start-time', 'end-time', 'song-id'];
  // }

  constructor() {
    super();
    const template = document.getElementById("song-item-template");
    this.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.setupEventListeners();
    this.render();
  }

  setupEventListeners() {
    this.querySelector(".edit-btn").addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("edit-song", {
          bubbles: true,
          detail: { songId: this.getAttribute("song-id") },
        })
      );
    });

    this.querySelector(".delete-btn").addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("delete-song", {
          bubbles: true,
          detail: { songId: this.getAttribute("song-id") },
        })
      );
    });
  }

  render() {
    this.querySelector(".song-title").textContent =
      this.getAttribute("title") || "Unknown Title";
    this.querySelector(".song-subtext").textContent =
      this.getAttribute("subtext") || "Unknown Artist";
    this.querySelector(".song-time-range").textContent = `${
      this.getAttribute("start-time") || "Not set"
    } - ${this.getAttribute("end-time") || "Not set"}`;
  }
}

customElements.define("song-item", SongItem);

document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
});

function initializeApp() {
  loadSongs().then((songs) => {
    renderSongs(songs);
    setupEventListeners(songs);
  });
}

async function loadSongs() {
  try {
    const data = await chrome.storage.local.get(SAVED_SONGS_DB_KEY);
    return data.songs || [];
  } catch (error) {
    console.error("Error loading songs:", error);
    document.getElementById("error-message").textContent =
      "Failed to load songs. Please try again.";
    return [];
  }
}

function renderSongs(songs) {
  const container = document.getElementById("songs-container");
  container.innerHTML = "";

  if (songs.length === 0) {
    container.innerHTML =
      '<div class="empty-message">No songs found. Play songs on YouTube Music to start tracking them.</div>';
    return;
  }

  container.innerHTML = songs
    .map(
      (song) => `
    <song-item
      song-id="${song.id}"
      title="${song.title || ""}"
      subtext="${song.subtext || ""}"
      start-time="${formatTime(song.startTime)}"
      end-time="${formatTime(song.endTime)}">
    </song-item>
  `
    )
    .join("");
}

function setupEventListeners(songs) {
  const container = document.getElementById("songs-container");
  const editFormTemplate = document.getElementById("edit-form-template");

  // Handle song events
  container.addEventListener("edit-song", (e) => {
    const songId = e.detail.songId;
    const song = songs.find((s) => s.id === songId);

    // Remove any existing edit forms
    const existingForm = container.querySelector("#edit-form-container");
    if (existingForm) {
      existingForm.remove();
    }

    if (song) {
      // Clone the template and insert after the song-item
      const songElement = container.querySelector(
        `song-item[song-id="${songId}"]`
      );
      const editForm = editFormTemplate.content.cloneNode(true);

      // Fill in the form values
      editForm.querySelector("#edit-song-id").value = song.id;
      editForm.querySelector("#edit-title").value = song.title || "";
      editForm.querySelector("#edit-subtext").value = song.subtext || "";
      editForm.querySelector("#edit-start-time").value = song.startTime || "";
      editForm.querySelector("#edit-end-time").value = song.endTime || "";

      // Add event listeners to the new form
      editForm
        .querySelector("#edit-form")
        .addEventListener("submit", async (event) => {
          event.preventDefault();
          const form = event.target;
          const startTime = form.querySelector("#edit-start-time").value;
          const endTime = form.querySelector("#edit-end-time").value;
          const subtext = form.querySelector("#edit-subtext").value;

          await updateSong(
            songId,
            {
              subtext,
              startTime: startTime ? parseFloat(startTime) : null,
              endTime: endTime ? parseFloat(endTime) : null,
            },
            songs
          );

          // Remove the form after submission
          form.closest("#edit-form-container").remove();
        });

      editForm.querySelector("#cancel-edit").addEventListener("click", (e) => {
        e.target.closest("#edit-form-container").remove();
      });

      // Insert the form after the song item
      songElement.insertAdjacentElement(
        "afterend",
        editForm.querySelector("#edit-form-container")
      );
    }
  });

  // Handle search
  const searchInput = document.getElementById("search-input");
  searchInput.addEventListener("input", () => {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredSongs = songs.filter((song) => {
      return (
        song.title?.toLowerCase().includes(searchTerm) ||
        song.subtext?.toLowerCase().includes(searchTerm)
      );
    });
    renderSongs(filteredSongs);
  });
}

async function updateSong(songId, updates, songs) {
  const index = songs.findIndex((song) => song.id === songId);
  if (index !== -1) {
    songs[index] = { ...songs[index], ...updates };
    await saveSongs(songs);
    renderSongs(songs);
  }
}

async function deleteSong(songId, songs) {
  const updatedSongs = songs.filter((song) => song.id !== songId);
  await saveSongs(updatedSongs);
  renderSongs(updatedSongs);
}

async function saveSongs(songs) {
  try {
    await chrome.storage.local.set({ [SAVED_SONGS_DB_KEY]: songs });
    return songs;
  } catch (error) {
    console.error("Error saving songs:", error);
    document.getElementById("error-message").textContent =
      "Failed to save changes. Please try again.";
    return null;
  }
}

// Helper function to format time in MM:SS format
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "Not set";

  seconds = parseFloat(seconds);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}
