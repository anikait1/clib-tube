// Constants
const SAVED_SONGS_DB_KEY = "songs";

// Song Item Component - represents a single row in the song list
class SongItem extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  static get observedAttributes() {
    return ['id', 'title', 'subtext', 'start-time', 'end-time'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (this.shadowRoot.querySelector('.song-row')) {
      this.render();
    }
  }

  render() {
    const id = this.getAttribute('id') || '';
    const title = this.getAttribute('title') || '';
    const subtext = this.getAttribute('subtext') || '';
    const startTime = this.getAttribute('start-time') || '';
    const endTime = this.getAttribute('end-time') || '';

    this.shadowRoot.innerHTML = `
      <style>
        .song-row {
          display: flex;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #eee;
        }
        .song-info {
          flex: 1;
        }
        .song-title {
          font-weight: bold;
        }
        .song-subtext {
          font-size: 0.9em;
          color: #666;
        }
        .song-times {
          margin: 0 16px;
          white-space: nowrap;
        }
        .song-actions {
          display: flex;
          gap: 8px;
        }
        .edit-form {
          display: none;
          margin-top: 8px;
        }
        .edit-form.active {
          display: block;
        }
        .form-row {
          margin-bottom: 8px;
          display: flex;
          align-items: center;
        }
        .form-row label {
          width: 100px;
        }
        .form-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
      </style>
      
      <div class="song-row">
        <div class="song-info">
          <div class="song-title">${title}</div>
          <div class="song-subtext">${subtext}</div>
        </div>
        <div class="song-times">
          <span>${formatTime(startTime)} - ${formatTime(endTime)}</span>
        </div>
        <div class="song-actions">
          <button class="edit-btn">Edit</button>
          <button class="delete-btn">Delete</button>
        </div>
      </div>
      
      <div class="edit-form">
        <div class="form-row">
          <label for="edit-subtext">Artist/Album:</label>
          <input type="text" id="edit-subtext" value="${subtext}">
        </div>
        <div class="form-row">
          <label for="edit-start-time">Start Time:</label>
          <input type="number" id="edit-start-time" value="${startTime}" step="0.1" min="0">
        </div>
        <div class="form-row">
          <label for="edit-end-time">End Time:</label>
          <input type="number" id="edit-end-time" value="${endTime}" step="0.1" min="0">
        </div>
        <div class="form-actions">
          <button class="cancel-btn">Cancel</button>
          <button class="save-btn">Save</button>
        </div>
      </div>
    `;
  }

  setupEventListeners() {
    const editBtn = this.shadowRoot.querySelector('.edit-btn');
    const deleteBtn = this.shadowRoot.querySelector('.delete-btn');
    const saveBtn = this.shadowRoot.querySelector('.save-btn');
    const cancelBtn = this.shadowRoot.querySelector('.cancel-btn');
    const editForm = this.shadowRoot.querySelector('.edit-form');

    editBtn.addEventListener('click', () => {
      editForm.classList.add('active');
    });

    cancelBtn.addEventListener('click', () => {
      editForm.classList.remove('active');
    });

    saveBtn.addEventListener('click', () => {
      const newSubtext = this.shadowRoot.querySelector('#edit-subtext').value;
      const newStartTime = this.shadowRoot.querySelector('#edit-start-time').value;
      const newEndTime = this.shadowRoot.querySelector('#edit-end-time').value;
      
      const songId = this.getAttribute('id');
      
      // Dispatch custom event to notify parent component
      this.dispatchEvent(new CustomEvent('song-updated', {
        bubbles: true,
        composed: true,
        detail: {
          id: songId,
          subtext: newSubtext,
          startTime: parseFloat(newStartTime),
          endTime: parseFloat(newEndTime)
        }
      }));
      
      editForm.classList.remove('active');
    });

    deleteBtn.addEventListener('click', () => {
      const songId = this.getAttribute('id');
      
      // Dispatch custom event to notify parent component
      this.dispatchEvent(new CustomEvent('song-deleted', {
        bubbles: true,
        composed: true,
        detail: { id: songId }
      }));
    });
  }
}

// Song List Component - manages the list of songs with pagination
class SongList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.songs = [];
    this.currentPage = 1;
    this.itemsPerPage = 5;
  }

  connectedCallback() {
    this.render();
    this.loadSongs();
    this.setupEventListeners();
  }

  async loadSongs() {
    try {
      const data = await chrome.storage.local.get(SAVED_SONGS_DB_KEY);
      this.songs = data.songs || [];
      this.renderSongs();
    } catch (error) {
      console.error('Error loading songs:', error);
      this.shadowRoot.querySelector('#error-message').textContent = 
        'Failed to load songs. Please try again.';
    }
  }

  setupEventListeners() {
    this.shadowRoot.addEventListener('song-updated', (event) => {
      this.updateSong(event.detail);
    });

    this.shadowRoot.addEventListener('song-deleted', (event) => {
      this.deleteSong(event.detail.id);
    });

    const itemsPerPageSelect = this.shadowRoot.querySelector('#items-per-page');
    itemsPerPageSelect.addEventListener('change', () => {
      this.itemsPerPage = parseInt(itemsPerPageSelect.value);
      this.currentPage = 1;
      this.renderSongs();
    });

    const prevPageBtn = this.shadowRoot.querySelector('#prev-page');
    prevPageBtn.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderSongs();
      }
    });

    const nextPageBtn = this.shadowRoot.querySelector('#next-page');
    nextPageBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(this.songs.length / this.itemsPerPage);
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.renderSongs();
      }
    });
  }

  async updateSong(updatedSong) {
    const index = this.songs.findIndex(song => song.id === updatedSong.id);
    if (index !== -1) {
      this.songs[index] = { 
        ...this.songs[index], 
        ...updatedSong 
      };
      
      await this.saveSongs();
      this.renderSongs();
    }
  }

  async deleteSong(songId) {
    this.songs = this.songs.filter(song => song.id !== songId);
    await this.saveSongs();
    this.renderSongs();
  }

  async saveSongs() {
    try {
      await chrome.storage.local.set({ [SAVED_SONGS_DB_KEY]: this.songs });
    } catch (error) {
      console.error('Error saving songs:', error);
      this.shadowRoot.querySelector('#error-message').textContent = 
        'Failed to save changes. Please try again.';
    }
  }

  renderSongs() {
    const songContainer = this.shadowRoot.querySelector('#song-container');
    songContainer.innerHTML = '';
    
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    const songsToShow = this.songs.slice(startIndex, endIndex);
    
    if (songsToShow.length === 0) {
      songContainer.innerHTML = '<p>No songs found.</p>';
      return;
    }
    
    songsToShow.forEach(song => {
      const songItem = document.createElement('song-item');
      songItem.setAttribute('id', song.id);
      songItem.setAttribute('title', song.title || '');
      songItem.setAttribute('subtext', song.subtext || '');
      songItem.setAttribute('start-time', song.startTime || '0');
      songItem.setAttribute('end-time', song.endTime || '0');
      songContainer.appendChild(songItem);
    });
    
    // Update pagination info
    const totalPages = Math.ceil(this.songs.length / this.itemsPerPage);
    this.shadowRoot.querySelector('#page-info').textContent = 
      `Page ${this.currentPage} of ${totalPages || 1}`;
    
    // Update button states
    this.shadowRoot.querySelector('#prev-page').disabled = this.currentPage <= 1;
    this.shadowRoot.querySelector('#next-page').disabled = this.currentPage >= totalPages;
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        .container {
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 0 auto;
          padding: 16px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .title {
          font-size: 1.5em;
          margin: 0;
        }
        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
        }
        .error {
          color: red;
          margin: 8px 0;
        }
      </style>
      
      <div class="container">
        <div class="header">
          <h1 class="title">YouTube Music Time Tracker</h1>
          <div>
            <label for="items-per-page">Items per page:</label>
            <select id="items-per-page">
              <option value="5" selected>5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </select>
          </div>
        </div>
        
        <div id="error-message" class="error"></div>
        
        <div id="song-container"></div>
        
        <div class="pagination">
          <button id="prev-page">Previous</button>
          <span id="page-info">Page 1 of 1</span>
          <button id="next-page">Next</button>
        </div>
      </div>
    `;
  }
}

// Helper function to format time in MM:SS format
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  
  seconds = parseFloat(seconds);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Register custom elements
customElements.define('song-item', SongItem);
customElements.define('song-list', SongList);

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  const songList = document.createElement('song-list');
  app.appendChild(songList);
});