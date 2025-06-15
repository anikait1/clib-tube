import {
  CurrentlyPlaying,
  MessageResponse,
  SavedSongsMap,
  Song,
  StorageData,
} from "./types";

const SAVED_SONGS_DB_KEY = "songs";
const DETECT_VIDEO_ELEMENT_TIMEOUT = 500; // ms
const VIDEO_ELEMENT_OBSERVER_ATTRIBUTE = "src";
const SONG_ID_NODE_SELECTOR = "a.ytp-title-link";
/**
 * TODO - We might want to start capturing more details about the song and
 * store additional information about it. To achieve this we would have to
 * start observing the ytmusic-player-bar for changes, currently we only care
 * about the song name and id, so observing the player-bar is not of use.
 *
 * const SONG_TITLE_NODE_SELECTOR =
 *   "ytmusic-player-bar div.middle-controls yt-formatted-string.title";
 * const SONG_SUBTEXT_NODE_SELECTOR =
 *   "ytmusic-player-bar div.middle-controls span.subtitle yt-formatted-string";
 */

const SAVED_SONGS: SavedSongsMap = new Map();
const CURRENTLY_PLAYING: CurrentlyPlaying = {
  id: null,
  title: null,

  reset() {
    this.id = null;
    this.title = null;
  },

  data() {
    return {
      id: this.id,
      title: this.title,
    };
  },
};

/**
 * Controls which part of currently playing song should be played.
 * Only changes the position of the track, if it is part of SAVE_SONGS
 * and has either startTime or endTime configured for it.
 */
function timeupdateHandler(event: Event): void {
  const song = SAVED_SONGS.get(CURRENTLY_PLAYING.id!);
  /**
   * Ideally we should never be in a situation where the handler is
   * configured for songs which are not part of SAVED_SONGS. So
   * this acts more as a safety check
   */
  if (!song) {
    console.log("timeupdateHandler fired for a song not being tracked", {
      event,
      currentlyPlaying: CURRENTLY_PLAYING.data(),
    });
    return;
  }

  const video = event.target;
  if (!video || !(video instanceof HTMLVideoElement)) {
    console.log(
      "timeupdateHandler is not configured correctly, event fired for a non video element",
      {
        event,
      }
    );
    return;
  }

  if (song.startTime && video.currentTime < song.startTime) {
    video.currentTime = song.startTime;
  } else if (song.endTime && video.currentTime > song.endTime) {
    video.currentTime = video.duration + 10;
  }
}

/**
 * Youtube music plays the songs in a video player, we recursively call this function
 * to identify when the video element appears in the DOM. Once we know that the element
 * is there, we detect for changes to the 'src' attribute of the video element. The
 * changes to 'src' attribute signify song being changed.
 */
function detectVideoElement() {
  const videoElement = document.querySelector("video");
  if (!videoElement) {
    setTimeout(detectVideoElement, DETECT_VIDEO_ELEMENT_TIMEOUT);
    return;
  }

  new MutationObserver(function videoElementSrcAttributeObserver(
    mutations,
    _observer
  ) {
    for (const mutation of mutations) {
      if (
        !(mutation.target instanceof HTMLVideoElement) ||
        mutation.type !== "attributes" ||
        mutation.attributeName !== VIDEO_ELEMENT_OBSERVER_ATTRIBUTE
      )
        continue;

      const videoElement = mutation.target;
      /**
       * Reset the listener and currently playing on change of the song,
       * we only need the listener if the song being played is stored in SAVED_SONGS
       */
      videoElement.removeEventListener("timeupdate", timeupdateHandler);
      CURRENTLY_PLAYING.reset();

      const idNode = document.querySelector(SONG_ID_NODE_SELECTOR);
      if (!idNode || !(idNode instanceof HTMLAnchorElement) || !idNode.href) {
        console.log(
          `detectVideoElement found an incorrect node for ${SONG_ID_NODE_SELECTOR}`,
          { node: idNode }
        );
        return;
      }

      /**
       * The 'v' query parameter refers to the unique identifier of each
       * song and is used as id in the system
       */
      const songId = new URL(idNode.href).searchParams.get("v");
      if (!songId) {
        console.log("detectVideoElement unable to find the song id", {
          node: idNode,
          url: idNode.href,
        });
        return;
      }
      CURRENTLY_PLAYING.id = songId;
      CURRENTLY_PLAYING.title = idNode.textContent;

      if (!SAVED_SONGS.has(songId)) return;

      videoElement.addEventListener("timeupdate", timeupdateHandler);
    }
  }).observe(videoElement, {
    attributes: true,
    attributeFilter: [VIDEO_ELEMENT_OBSERVER_ATTRIBUTE],
    childList: false,
    subtree: false,
  });
}

function loadSongs(songs: Song[]) {
  for (const song of songs) {
    SAVED_SONGS.set(song.id, {
      startTime: song.startTime,
      endTime: song.endTime,
      title: song.title,
    });
  }
}

function setupWebExtensionAPIs() {
  chrome.storage.local
    .get<StorageData>(SAVED_SONGS_DB_KEY)
    .then(function loadSongsFromStorage(data: StorageData) {
      return loadSongs(data.songs ?? []);
    })
    .catch(function unableToLoadSongs(err) {
      console.error("Unable to load songs from storage", err);
    });

  /**
   * Web extension's popup doesn't have access to the DOM. In order to communicate
   * with the extension, we need to use message passing. We listen for messages from the popup
   * and respond accordingly.
   * ref: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
   */
  chrome.runtime.onMessage.addListener(function extensionEventListener(
    request: { type: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) {
    const requestType = request.type;

    let response: MessageResponse;
    switch (requestType) {
      case "currently-playing": {
        response = !CURRENTLY_PLAYING.id
          ? {
              success: false,
              error: "No song is currently playing",
            }
          : {
              success: true,
              data: CURRENTLY_PLAYING.data(),
            };
        break;
      }
      default: {
        console.log(`Unknown event type: ${requestType}`);
      }
    }

    /**
     * Message passing has some caveats in regards to responding to
     * events. In this case we're responding syncrhonously.
     * API expects us to return false so that it can close the conneciton,
     * if some asyncrhonous operation needs to be done here, remember to
     * return true so the connection can be kept open until sendResponse is
     * called. Refer the above attached chrome docs for more information
     */
    sendResponse(response);
    return false;
  });

  /**
   * Events in case storage space is modified
   * ref: https://developer.chrome.com/docs/extensions/reference/api/storage#event-onChanged
   */
  chrome.storage.local.onChanged.addListener(function handleStorageChanges(
    changes: { [key: string]: chrome.storage.StorageChange },
  ) {
    const { songs } = changes;
    if (!songs?.newValue) return;

    /** TODO - explore if validating the data's shape would be a good idea in here */
    loadSongs(songs.newValue ?? [])
  });
}

function main() {
  setupWebExtensionAPIs();
  detectVideoElement();
}

try {
  main();
} catch (err) {
  console.error("Something went wrong", err);
}
