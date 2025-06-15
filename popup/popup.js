/** @typedef {import('../types').Song} Song */
/** @typedef {import('../types').CurrentlyPlaying} CurrentlyPlaying */
/** @typedef {import('../types').StorageData} StorageData */

const SAVED_SONGS_DB_KEY = "songs";
const SONGS_CONTAINER_NODE_IDENTIFIER = "songs-container";
const EDIT_FORM_TEMPLATE_NODE_IDENTIFIER = "edit-form-template";

/** @type {Song[]} */
const SAVED_SONGS = [];

class SongItem extends HTMLElement {
  static get observedAttributes() {
    return ["title", "start-time", "end-time", "song-id"];
  }

  constructor() {
    super();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.rendered) return;
    if (oldValue === newValue) return;

    this.renderAttributes();
  }

  connectedCallback() {
    const template = document.getElementById("song-item-template");
    this.appendChild(template.content.cloneNode(true));
    this.rendered = true;

    this.renderAttributes();
  }

  renderAttributes() {
    this.querySelector(".song-title").textContent =
      this.getAttribute("title") || "Unknown Title";
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
        SAVED_SONGS.push(...(data.songs ?? []));

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

  document
    .getElementById("search-input")
    .addEventListener("input", function filterSongs(event) {
      const searchTerm = event.target.value.toLowerCase();
      const filteredSongs = SAVED_SONGS.filter((song) => {
        return song.title?.toLowerCase().includes(searchTerm);
      });
      renderSongs(filteredSongs);
    });

  document
    .getElementById("add-current-song")
    .addEventListener("click", async () => {
      try {
        const [tab] = await chrome.tabs.query({
          url: "https://music.youtube.com/*",
        });

        console.log(tab)

        if (!tab) {
          document.getElementById("error-message").textContent = "Youtube music is not running"
          return
        };

        // TODO - understand how constants can be shared between content-script and popup.js
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: "currently-playing",
        });

        if (!response) {
          document.getElementById("error-message").textContent =
            "Something went wrong. Please try again.";
          return;
        }

        if (!response.success) {
          document.getElementById("error-message").textContent = response.error;
          return;
        }

        /**
         * Popup only receives a successful response in case the content script was successful
         * in saving the song to the DB, so we can safely add the song to the SAVED_SONGS array.
         * Next time the popup is loaded, the SAVED_SONGS array will be populated with the
         * songs saved in the DB.
         */
        SAVED_SONGS.push({
          ...response.data,
          startTime: null,
          endTime: null,
        });

        renderSongs();
      } catch (error) {
        console.error("Error adding song:", error);
        document.getElementById("error-message").textContent =
          "Failed to add song. Please try again.";
      }
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
  editSongSection.getElementById("edit-start-time").value =
    song.startTime || "";
  editSongSection.getElementById("edit-end-time").value = song.endTime || "";

  const editSongSectionNode = editSongSection.querySelector(
    ".edit-form-container"
  );
  editSongSectionNode.id = editFormIdentifier;

  editSongSectionNode
    .querySelector(".edit-form")
    .addEventListener("submit", function handleEditSongFormSubmission(event) {
      event.preventDefault();
      const form = event.target;
      const startTime = form.querySelector("#edit-start-time").value;
      const endTime = form.querySelector("#edit-end-time").value;

      song.startTime = startTime ? parseFloat(startTime) : null;
      song.endTime = endTime ? parseFloat(endTime) : null;

      songItemElement.setAttribute("start-time", formatTime(song.startTime));
      songItemElement.setAttribute("end-time", formatTime(song.endTime));

      chrome.storage.local
        .set({ [SAVED_SONGS_DB_KEY]: SAVED_SONGS })
        .then(() => {
          console.log("songs saved in storage");
        })
        .catch((error) => {
          console.error("Error saving songs:", error);
        });

      editSongSectionNode.remove();
    });

  editSongSectionNode
    .querySelector("#cancel-edit")
    .addEventListener("click", () => {
      editSongSectionNode.remove();
    });

  songItemElement.insertAdjacentElement("afterend", editSongSectionNode);
}

function handleDeleteSong(deletedSong) {
  const deleteConfirmation = confirm(
    "Are you sure you want to delete this song?"
  );
  if (!deleteConfirmation) return;

  const index = SAVED_SONGS.findIndex((song) => song.id === deletedSong.id);
  if (index === -1) return;

  SAVED_SONGS.splice(index, 1);
  renderSongs();

  chrome.storage.local
    .set({ [SAVED_SONGS_DB_KEY]: SAVED_SONGS })
    .then(() => {
      console.log("songs saved in storage");
    })
    .catch((error) => {
      console.error("Error saving songs:", error);
    });
}

/** @param {number|null} seconds */
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "Not set";

  seconds = parseFloat(seconds);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}
