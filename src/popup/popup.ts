import { Song, StorageData } from "../types";

const SAVED_SONGS_DB_KEY = "songs";
const SONGS_CONTAINER_NODE_IDENTIFIER = "songs-container";
const EDIT_FORM_TEMPLATE_NODE_IDENTIFIER = "edit-form-template";

const SAVED_SONGS: Song[] = [];

class SongItem extends HTMLElement {
  private rendered = false;

  static get observedAttributes() {
    return ["title", "start-time", "end-time", "song-id"];
  }

  constructor() {
    super();
  }

  attributeChangedCallback(_name: string, oldValue: string, newValue: string) {
    if (!this.rendered) return;
    if (oldValue === newValue) return;

    this.renderAttributes();
  }

  connectedCallback() {
    const template = document.getElementById("song-item-template") as HTMLTemplateElement;
    this.appendChild(template.content.cloneNode(true));
    this.rendered = true;

    this.renderAttributes();
  }

  renderAttributes() {
    const titleElement = this.querySelector(".song-title");
    const timeRangeElement = this.querySelector(".song-time-range");
    
    if (titleElement) {
      titleElement.textContent = this.getAttribute("title") || "Unknown Title";
    }
    if (timeRangeElement) {
      timeRangeElement.textContent = `${
        this.getAttribute("start-time") || "Not set"
      } - ${this.getAttribute("end-time") || "Not set"}`;
    }
  }
}

customElements.define("song-item", SongItem);

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local
    .get<StorageData>(SAVED_SONGS_DB_KEY)
    .then(
      function loadSavedSongs(data: StorageData) {
        SAVED_SONGS.length = 0;
        SAVED_SONGS.push(...(data.songs ?? []));

        renderSongs();
        setupEventListeners();
      }
    )
    .catch((error: unknown) => {
      console.error("Error loading songs:", error);
      const errorElement = document.getElementById("error-message");
      if (errorElement) {
        errorElement.textContent = "Failed to load songs. Please try again.";
      }
    });
});

function renderSongs(songs: Song[] = SAVED_SONGS) {
  const container = document.getElementById(SONGS_CONTAINER_NODE_IDENTIFIER);
  if (!container) return;
  
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
  container?.addEventListener("click", (event) => {
    if (!(event.target instanceof HTMLButtonElement)) return;

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

  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  searchInput?.addEventListener("input", function filterSongs(event) {
    const target = event.target as HTMLInputElement;
    const searchTerm = target.value.toLowerCase();
    const filteredSongs = SAVED_SONGS.filter((song) => {
      return song.title?.toLowerCase().includes(searchTerm);
    });
    renderSongs(filteredSongs);
  });

  const addCurrentSongBtn = document.getElementById("add-current-song");
  addCurrentSongBtn?.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({
        url: "https://music.youtube.com/*",
      });

      console.log(tab);

      if (!tab) {
        const errorElement = document.getElementById("error-message");
        if (errorElement) {
          errorElement.textContent = "Youtube music is not running";
        }
        return;
      }

      // TODO - understand how constants can be shared between content-script and popup.ts
      const response = await chrome.tabs.sendMessage(tab.id!, {
        type: "currently-playing",
      });

      if (!response) {
        const errorElement = document.getElementById("error-message");
        if (errorElement) {
          errorElement.textContent = "Something went wrong. Please try again.";
        }
        return;
      }

      if (!response.success) {
        const errorElement = document.getElementById("error-message");
        if (errorElement) {
          errorElement.textContent = response.error;
        }
        return;
      }

      SAVED_SONGS.push({
        ...response.data,
        startTime: null,
        endTime: null,
      });

      chrome.storage.local
      .set({ [SAVED_SONGS_DB_KEY]: SAVED_SONGS })
      .catch((error: unknown) => {
        console.error("Error saving songs:", error);
      });

      renderSongs();
    } catch (error) {
      console.error("Error adding song:", error);
      const errorElement = document.getElementById("error-message");
      if (errorElement) {
        errorElement.textContent = "Failed to add song. Please try again.";
      }
    }
  });
}

function handleEditSongEvent(song: Song, songItemElement: Element) {
  const editFormIdentifier = `edit-form-section-${song.id}`;
  const existingEditForm = document.getElementById(editFormIdentifier);
  /**
   * If an edit form already exists for this song, we don't take any action
   * and just return early from the function
   */
  if (existingEditForm) {
    return;
  }

  const template = document.getElementById(EDIT_FORM_TEMPLATE_NODE_IDENTIFIER) as HTMLTemplateElement;
  const editSongSection = template.content.cloneNode(true) as DocumentFragment;

  const editSongId = editSongSection.getElementById("edit-song-id") as HTMLInputElement;
  const editTitle = editSongSection.getElementById("edit-title") as HTMLInputElement;
  const editStartTime = editSongSection.getElementById("edit-start-time") as HTMLInputElement;
  const editEndTime = editSongSection.getElementById("edit-end-time") as HTMLInputElement;

  if (editSongId) editSongId.value = song.id;
  if (editTitle) editTitle.value = song.title || "";
  if (editStartTime) editStartTime.value = song.startTime?.toString() || "";
  if (editEndTime) editEndTime.value = song.endTime?.toString() || "";

  const editSongSectionNode = editSongSection.querySelector(
    ".edit-form-container"
  ) as HTMLElement;
  if (editSongSectionNode) {
    editSongSectionNode.id = editFormIdentifier;
  }

  const editForm = editSongSectionNode?.querySelector(".edit-form") as HTMLFormElement;
  editForm?.addEventListener("submit", function handleEditSongFormSubmission(event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const startTimeInput = form.querySelector("#edit-start-time") as HTMLInputElement;
    const endTimeInput = form.querySelector("#edit-end-time") as HTMLInputElement;

    song.startTime = startTimeInput.value ? parseFloat(startTimeInput.value) : null;
    song.endTime = endTimeInput.value ? parseFloat(endTimeInput.value) : null;

    songItemElement.setAttribute("start-time", formatTime(song.startTime));
    songItemElement.setAttribute("end-time", formatTime(song.endTime));

    chrome.storage.local
      .set({ [SAVED_SONGS_DB_KEY]: SAVED_SONGS })
      .catch((error: unknown) => {
        console.error("Error saving songs:", error);
      });

    editSongSectionNode.remove();
  });

  const cancelBtn = editSongSectionNode?.querySelector("#cancel-edit") as HTMLButtonElement;
  cancelBtn?.addEventListener("click", () => {
    editSongSectionNode.remove();
  });

  songItemElement.insertAdjacentElement("afterend", editSongSectionNode);
}

function handleDeleteSong(deletedSong: Song) {
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
    .catch((error: unknown) => {
      console.error("Error saving songs:", error);
    });
}

function formatTime(seconds: number | null): string {
  if (!seconds || isNaN(seconds)) return "Not set";

  const parsedSeconds = parseFloat(seconds.toString());
  const minutes = Math.floor(parsedSeconds / 60);
  const remainingSeconds = Math.floor(parsedSeconds % 60);

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}