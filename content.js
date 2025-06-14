/** @typedef {import('./types').Song} Song */
/** @typedef {import('./types').CurrentlyPlaying} CurrentlyPlaying */
/** @typedef {import('./types').StorageData} StorageData */

const SAVED_SONGS_DB_KEY = "songs";
const DETECT_VIDEO_ELEMENT_TIMEOUT = 500; // ms
const VIDEO_ELEMENT_OBSERVER_ATTRIBUTE = "src";
const SONG_ID_NODE_SELECTOR = "a.ytp-title-link";

/**
 * TODO - We might want to start capturing more details about the song and
 * storing additional information about it. To achieve that we would have to
 * start observing the ytmusic-player-bar for changes, currently we only care
 * about the song name and id, so observing the player-bar is not of use
 *
 * const SONG_TITLE_NODE_SELECTOR =
 *   "ytmusic-player-bar div.middle-controls yt-formatted-string.title";
 * const SONG_SUBTEXT_NODE_SELECTOR =
 *   "ytmusic-player-bar div.middle-controls span.subtitle yt-formatted-string";
 */

/** @type {Map<string, {startTime: number|null, endTime: number|null, title: string}>} */
const SAVED_SONGS = new Map();

/** @type {CurrentlyPlaying} */
const CURRENTLY_PLAYING = {
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
 * @param {Event} event
 */
function timeupdateHandler(event) {
  const songDuration = SAVED_SONGS.get(CURRENTLY_PLAYING.id);
  if (!songDuration) return;

  /** @type {HTMLVideoElement} */
  const video = event.target;

  if (songDuration.startTime && video.currentTime < songDuration.startTime) {
    video.currentTime = songDuration.startTime;
  } else if (songDuration.endTime && video.currentTime > songDuration.endTime) {
    video.currentTime = video.duration + 10;
  }
}

/**
 * Youtube music plays the songs in a video player, we recursively call this function
 * to identify when the video element appears in the DOM. Once we know that the element
 * is there, we detect for changes to the 'src' attribute of the video element. The
 * changes to 'src' attribute signify change in  a song.
 */
function detectVideoElement() {
  const videoElement = document.querySelector("video");
  if (!videoElement) {
    setTimeout(detectVideoElement, DETECT_VIDEO_ELEMENT_TIMEOUT);
    return;
  }

  const observer = new MutationObserver(
    function videoElementSrcAttributeObserver(mutations, _observer) {
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
         * we only need if the song being played is stored in SAVED_SONGS
         */
        videoElement.removeEventListener("timeupdate", timeupdateHandler);
        CURRENTLY_PLAYING.reset();

        /** @type {HTMLAnchorElement} Query for the node containing song's id */
        const idNode = document.querySelector(SONG_ID_NODE_SELECTOR);
        if (!idNode || !idNode.href) return;

        /** update currently playing */
        CURRENTLY_PLAYING.id = new URL(idNode).searchParams.get("v");
        CURRENTLY_PLAYING.title = idNode.textContent;

        if (!SAVED_SONGS.has(CURRENTLY_PLAYING.id)) return;

        videoElement.addEventListener("timeupdate", timeupdateHandler);
      }
    }
  );

  observer.observe(videoElement, {
    attributes: true,
    attributeFilter: [VIDEO_ELEMENT_OBSERVER_ATTRIBUTE],
    childList: false,
    subtree: false,
  });
}

function main() {
  chrome.storage.local
    .get(SAVED_SONGS_DB_KEY)
    .then(
      /** @param {StorageData} data */
      function loadSavedSongs(data) {
        for (const song of data.songs ?? []) {
          SAVED_SONGS.set(song.id, {
            startTime: song.startTime,
            endTime: song.endTime,
            title: song.title,
          });
        }
      }
    )
    .catch(function unableToLoadSongs(err) {
      console.error("Unable to load songs from storage", err);
    });

  /**
   * Web extension's popup doesn't have access to the DOM of the page. In order to communicate
   * with the extension, we need to use message passing. We listen for messages from the popup
   * and respond accordingly.
   * ref: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
   */
  chrome.runtime.onMessage.addListener(function extensionEventListener(
    request,
    sender,
    sendResponse
  ) {
    const requestType = request.type;

    let response;
    switch (requestType) {
      case "add-current-song": {
        if (!CURRENTLY_PLAYING.id) {
          response = {
            success: false,
            error: "No song is currently playing",
          };
          break;
        }

        if (SAVED_SONGS.has(CURRENTLY_PLAYING.id)) {
          response = {
            success: false,
            error: "This song is already saved",
          };
          break;
        }

        try {
          SAVED_SONGS.set(CURRENTLY_PLAYING.id, {
            startTime: null,
            endTime: null,
            title: CURRENTLY_PLAYING.title,
          });

          response = {
            success: true,
            data: CURRENTLY_PLAYING.data(),
          };
        } catch (error) {
          console.error("Error saving songs:", error);
          response = {
            success: false,
            error: "Failed to save songs. Please try again.",
          };
        }

        break;
      }
      default: {
        console.log(`Unknown event type: ${requestType}`);
      }
    }

    chrome.storage.local
      .set({
        [SAVED_SONGS_DB_KEY]: Array.from(SAVED_SONGS.entries()).map(
          ([id, data]) => ({
            id,
            ...data,
          })
        ),
      })
      .then(() => sendResponse(response));
    return true;
  });

  detectVideoElement();
}

try {
  main();
} catch (err) {
  console.error("Something went wrong", err);
}
