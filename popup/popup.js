const SAVED_SONGS_DB_KEY = "songs";

class SongItem extends HTMLElement {
  // static get observedAttributes() {
  //   return ['title', 'subtext', 'start-time', 'end-time', 'song-id'];
  // }

  constructor() {
    super();
    const template = document.getElementById('song-item-template');
    this.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.setupEventListeners();
    this.render();
  }

  setupEventListeners() {
    this.querySelector('.edit-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('edit-song', {
        bubbles: true,
        detail: { songId: this.getAttribute('song-id') }
      }));
    });

    this.querySelector('.delete-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('delete-song', {
        bubbles: true,
        detail: { songId: this.getAttribute('song-id') }
      }));
    });
  }

  render() {
    this.querySelector('.song-title').textContent = 
      this.getAttribute('title') || 'Unknown Title';
    this.querySelector('.song-subtext').textContent = 
      this.getAttribute('subtext') || 'Unknown Artist';
    this.querySelector('.song-time-range').textContent = 
      `${this.getAttribute('start-time') || 'Not set'} - ${this.getAttribute('end-time') || 'Not set'}`;
  }
}

customElements.define('song-item', SongItem);

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function initializeApp() {
  loadSongs().then(songs => {
    renderSongs(songs);
    setupEventListeners(songs);
  });
}

async function loadSongs() {
  try {
    const data = await chrome.storage.local.get(SAVED_SONGS_DB_KEY);
    return data.songs || [];
  } catch (error) {
    console.error('Error loading songs:', error);
    document.getElementById('error-message').textContent = 'Failed to load songs. Please try again.';
    return [];
  }
}

function renderSongs(songs) {
  const container = document.getElementById('songs-container');
  container.innerHTML = '';
  
  if (songs.length === 0) {
    container.innerHTML = '<div class="empty-message">No songs found. Play songs on YouTube Music to start tracking them.</div>';
    return;
  }
  
  container.innerHTML = songs.map(song => `
    <song-item
      song-id="${song.id}"
      title="${song.title || ''}"
      subtext="${song.subtext || ''}"
      start-time="${formatTime(song.startTime)}"
      end-time="${formatTime(song.endTime)}">
    </song-item>
  `).join('');
}

function setupEventListeners(songs) {
  const container = document.getElementById('songs-container');
  const editForm = document.getElementById('edit-form');
  const editFormContainer = document.getElementById('edit-form-container');
  
  // Handle song events
  container.addEventListener('edit-song', (e) => {
    const songId = e.detail.songId;
    const song = songs.find(s => s.id === songId);
   
    if (song) {
      document.getElementById('edit-song-id').value = song.id;
      document.getElementById('edit-title').value = song.title || '';
      document.getElementById('edit-subtext').value = song.subtext || '';
      document.getElementById('edit-start-time').value = song.startTime || '';
      document.getElementById('edit-end-time').value = song.endTime || '';
      editFormContainer.style.display = 'block';
    }
  });

  container.addEventListener('delete-song', (e) => {
    const songId = e.detail.songId;
    if (confirm('Are you sure you want to delete this song?')) {
      deleteSong(songId, songs);
    }
  });

  // Handle form submission
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const songId = document.getElementById('edit-song-id').value;
    const startTime = document.getElementById('edit-start-time').value;
    const endTime = document.getElementById('edit-end-time').value;
    const subtext = document.getElementById('edit-subtext').value;
    
    await updateSong(songId, {
      subtext,
      startTime: startTime ? parseFloat(startTime) : null,
      endTime: endTime ? parseFloat(endTime) : null
    }, songs);
    
    editFormContainer.style.display = 'none';
  });
  
  // Handle cancel button
  document.getElementById('cancel-edit').addEventListener('click', () => {
    editFormContainer.style.display = 'none';
  });
  
  // Handle search
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredSongs = songs.filter(song => {
      return (
        (song.title?.toLowerCase().includes(searchTerm)) || 
        (song.subtext?.toLowerCase().includes(searchTerm))
      );
    });
    renderSongs(filteredSongs);
  });
}

async function updateSong(songId, updates, songs) {
  const index = songs.findIndex(song => song.id === songId);
  if (index !== -1) {
    songs[index] = { ...songs[index], ...updates };
    await saveSongs(songs);
    renderSongs(songs);
  }
}

async function deleteSong(songId, songs) {
  const updatedSongs = songs.filter(song => song.id !== songId);
  await saveSongs(updatedSongs);
  renderSongs(updatedSongs);
}

async function saveSongs(songs) {
  try {
    await chrome.storage.local.set({ [SAVED_SONGS_DB_KEY]: songs });
    return songs;
  } catch (error) {
    console.error('Error saving songs:', error);
    document.getElementById('error-message').textContent = 'Failed to save changes. Please try again.';
    return null;
  }
}

// Helper function to format time in MM:SS format
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return 'Not set';
  
  seconds = parseFloat(seconds);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}