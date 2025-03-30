/** @typedef {import('./types').Song} Song */
/** @typedef {import('./types').CurrentlyPlaying} CurrentlyPlaying */
/** @typedef {import('./types').StorageData} StorageData */


const MUSIC_PLAYER_NODE_SELECTOR = "ytmusic-player-bar";
const SONG_ID_NODE_SELECTOR = "a.ytp-title-link";
const SONG_DETAILS_PARENT_NODE = "div.middle-controls";
const SONG_TITLE_NODE_SELECTOR = "yt-formatted-string.title";
const SONG_SUBTEXT_NODE_SELECTOR = "span.subtitle yt-formatted-string";

const SAVED_SONGS_DB_KEY = "songs";

/** @type {Map<string, {startTime: number, endTime: number|null}>} */
const SAVED_SONGS = new Map();

/** @type {CurrentlyPlaying} */
const CURRENTLY_PLAYING = {
  id: null,
  title: null,
  subtext: null,

  reset() {
    this.id = null;
    this.title = null;
    this.subtext = null;
  },
};

/**
 * @param {HTMLElement} songDetailsNode - The song details HTML element
 * @param {HTMLAnchorElement} songLinkNode - The song link anchor element
 * @returns {boolean}
 */
function updateCurrentlyPlaying(songDetailsNode, songLinkNode) {
  const title = songDetailsNode
    .querySelector(SONG_TITLE_NODE_SELECTOR)
    ?.getAttribute("title");
  const subtext = songDetailsNode
    .querySelector(SONG_SUBTEXT_NODE_SELECTOR)
    ?.getAttribute("title");

  if (!title || !subtext) {
    console.debug(
      "[CURRENTLY PLAYING] unable to find either the song name or sub-text",
      { title, subtext, song: CURRENTLY_PLAYING }
    );
    return false;
  }

  /**
   * The url is of the following format and we only require the value of
   * 'v' query param since it will act as the id of the song
   * 'https://music.youtube.com/watch?list=RDAMVMBLNHOgy_HCI&v=BLNHOgy_HCI'
   */
  CURRENTLY_PLAYING.id = new URL(songLinkNode.href).searchParams.get("v");
  CURRENTLY_PLAYING.title = title;
  CURRENTLY_PLAYING.subtext = subtext;

  console.log(CURRENTLY_PLAYING)

  return true;
}

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
 * @param {MutationRecord[]} mutation
 * @param {MutationObserver} observer
 * @returns {void}
 */
function setupSongDetailsObserver(mutation, observer) {
  const record = mutation[0];
  if (!record.target.href) {
    return;
  }

  const musicPlayer = document.querySelector(MUSIC_PLAYER_NODE_SELECTOR);
  if (!musicPlayer) {
    return;
  }

  /**
   * Remove the timeupdate listener before processing the new song.
   *
   * This serves two purposes:
   * 1. Prevents potential race conditions where timeupdate events fire with
   *    stale song data during the song transition
   * 2. Ensures we don't unnecessarily process timeupdate events for
   *    non-tracked songs
   *
   * Note: Even though CURRENTLY_PLAYING.reset() below would prevent any
   * issues with stale data, we still remove the listener since either
   * way we only want the listener for songs that are being tracked
   */
  document
    .querySelector("video")
    .removeEventListener("timeupdate", timeupdateHandler);

  /**
   * Reset current song data before the mutation observer updates it.
   * This ensures we don't have stale data in CURRENTLY_PLAYING during
   * the transition between songs.
   */
  CURRENTLY_PLAYING.reset();

  new MutationObserver(function updateCurrentlyPlayingObserver(
    mutation,
    observer
  ) {
    const songDetails = musicPlayer.querySelector(SONG_DETAILS_PARENT_NODE);
    if (!songDetails) {
      console.debug("[SONG OBSERVER] unable to find song details");
      return;
    }

    const currentlyPlayingUpdated = updateCurrentlyPlaying(
      songDetails,
      record.target
    );

    if (!currentlyPlayingUpdated) {
      return;
    }

    observer.disconnect();
    if (SAVED_SONGS.has(CURRENTLY_PLAYING.id)) {
      document
        .querySelector("video")
        .addEventListener("timeupdate", timeupdateHandler);
    }
  }).observe(musicPlayer, {
    childList: true,
    subtree: true,
  });
}
/**
 * @param {MutationRecord[]} mutation
 * @param {MutationObserver} observer
 * @returns {void}
 */
function setupSongMutationObserver(mutation, observer) {
  const node = document.querySelector(SONG_ID_NODE_SELECTOR);
  if (!node || !node.href) return;

  /**
   * In case we found the node which contains the song id, we
   * will add a separate observer on that node that will watch
   * for changes on 'href' attribute and update the song details
   * accordingly. Also the current 'observer' would be disconnected
   *
   * NOTE: song id is the 'v' query param we get from the link
   * of 'href' attribute
   */
  new MutationObserver(setupSongDetailsObserver).observe(node, {
    attributes: true,
    attributeFilter: ["href"],
  });
  observer.disconnect();
}

function start() {
  new MutationObserver(setupSongMutationObserver).observe(
    document.querySelector("body"),
    {
      attributes: true,
      childList: true,
      subtree: true,
    }
  );
  
  chrome.storage.local.get(SAVED_SONGS_DB_KEY).then(
    /**
     * @param {StorageData} data
     */
    function loadSavedSongs(data) {
      console.log(data)
      for (const song of data.songs) {
        SAVED_SONGS.set(song.id, {
          startTime: song.startTime,
          endTime: song.endTime,
        });
      }
    }
  );
}

start()