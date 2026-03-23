import './style.css';
import { App } from './app.js';

// ─── Register games (add new games by importing them here) ───
import './games/werewolf.js';
import './games/undercover.js';

const app = new App();
app.mount(document.getElementById('app'));
