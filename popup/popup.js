/** @typedef {import('../types').Song} Song */
/** @typedef {import('../types').CurrentlyPlaying} CurrentlyPlaying */
/** @typedef {import('../types').StorageData} StorageData */

const SAVED_SONGS_DB_KEY = "songs";
const SONGS_CONTAINER_NODE_IDENTIFIER = "songs-container";
const EDIT_FORM_TEMPLATE_NODE_IDENTIFIER = "edit-form-template";

/** @type {Song[]} */
const SAVED_SONGS = [];

class SongItem extends HTMLElement {
  // static get observedAttributes() {
  //   return ['title', 'subtext', 'start-time', 'end-time', 'song-id'];
  // }

  constructor() {
    super();
  }

  connectedCallback() {
    const template = document.getElementById("song-item-template");
    this.appendChild(template.content.cloneNode(true));

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
  chrome.storage.local
    .get(SAVED_SONGS_DB_KEY)
    .then(
      /** @param {StorageData} data */
      function loadSavedSongs(data) {
        SAVED_SONGS.length = 0;
        SAVED_SONGS.push(...data.songs);

        renderSongs();
        setupEventListeners();
      }
    )
    .catch((error) => {
      console.error("Error loading songs:", error);
      document.getElementById("error-message").textContent =
        "Failed to load songs. Please try again.";
    });
});

/** @param {Song[]} [songs] - Optional array of songs, falls back to SAVED_SONGS if not provided */
function renderSongs(songs = SAVED_SONGS) {
  const container = document.getElementById(SONGS_CONTAINER_NODE_IDENTIFIER);
  container.innerHTML = "";

  if (songs.length === 0) {
    container.innerHTML =
      '<div class="empty-message">No songs found. Play songs on YouTube Music to start tracking them.</div>';
    return;
  }

  for (const song of songs) {
    const songItem = document.createElement("song-item");
    songItem.setAttribute("song-id", song.id);
    songItem.setAttribute("title", song.title || "");
    songItem.setAttribute("subtext", song.subtext || "");
    songItem.setAttribute("start-time", formatTime(song.startTime));
    songItem.setAttribute("end-time", formatTime(song.endTime));

    container.appendChild(songItem);
  }
}

function setupEventListeners() {
  /**
   * No individual event handler is added for each song, instead a click listener
   * is added on the song-container and if the event was bubbled up through
   * a button click and then depending upon the button class name
   * either the click or delete event handler is called
   */
  const container = document.getElementById(SONGS_CONTAINER_NODE_IDENTIFIER);
  container.addEventListener("click", (event) => {
    if (!(event.target instanceof HTMLButtonElement)) return;

    /** @type {HTMLButtonElement} */
    const clickedButton = event.target;
    const songItemElement = clickedButton.closest("song-item");
    if (!songItemElement) return;

    const songId = songItemElement.getAttribute("song-id");
    const song = SAVED_SONGS.find((song) => song.id === songId);
    if (!song) return;

    switch (clickedButton.className) {
      case "edit-btn":
        handleEditSongEvent(song, songItemElement);
        break;
      case "delete-btn":
        handleDeleteSong(song);
        break;
    }
  });

  const searchInput = document.getElementById("search-input");
  searchInput.addEventListener("input", () => {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredSongs = SAVED_SONGS.filter((song) => {
      return (
        song.title?.toLowerCase().includes(searchTerm) ||
        song.subtext?.toLowerCase().includes(searchTerm)
      );
    });
    renderSongs(filteredSongs);
  });
}

/**
 *
 * @param {Song} song
 * @param {HTMLElement} songItemElement
 */
function handleEditSongEvent(song, songItemElement) {
  const editFormIdentifier = `edit-form-section-${song.id}`;
  const existingEditForm = document.getElementById(editFormIdentifier);
  /**
   * If an edit form already exists for this song, we don't take any action
   * and just return early from the function
   */
  if (existingEditForm) {
    return;
  }

  /** @type {HTMLElement} */
  const editSongSection = document
    .getElementById(EDIT_FORM_TEMPLATE_NODE_IDENTIFIER)
    .content.cloneNode(true);

  editSongSection.getElementById("edit-song-id").value = song.id;
  editSongSection.getElementById("edit-title").value = song.title || "";
  editSongSection.getElementById("edit-subtext").value = song.subtext || "";
  editSongSection.getElementById("edit-start-time").value =
    song.startTime || "";
  editSongSection.getElementById("edit-end-time").value = song.endTime || "";

  const editSongSectionNode = editSongSection.querySelector(
    ".edit-form-container"
  );
  editSongSectionNode.id = editFormIdentifier;

  editSongSectionNode
    .querySelector(".edit-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.target;
      const startTime = form.querySelector("#edit-start-time").value;
      const endTime = form.querySelector("#edit-end-time").value;
      const subtext = form.querySelector("#edit-subtext").value;

      /** TODO - Check how the update will flow to the Storage and UI */
      // await updateSong(
      //   song.id,
      //   {
      //     subtext,
      //     startTime: startTime ? parseFloat(startTime) : null,
      //     endTime: endTime ? parseFloat(endTime) : null,
      //   },
      // );

      editSongSectionNode.remove();
    });

  editSongSectionNode
    .querySelector("#cancel-edit")
    .addEventListener("click", () => {
      editSongSectionNode.remove();
    });

  songItemElement.insertAdjacentElement("afterend", editSongSectionNode);
}

function handleDeleteSong(song) {
  if (confirm("Are you sure you want to delete this song?")) {
    /** TODO - Check how the delete will flow to the Storage and UI */
    // await deleteSong(song.id);
  }
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
