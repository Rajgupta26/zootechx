import { stdin, stdout } from 'node:process';

/**
 * Prompts for the terminal scripts.
 *
 * `hidden()` exists because the obvious implementation does not work. Patching
 * readline's private `_writeToOutput` after calling `question()` looks right
 * and silently fails on a pasted line — a Neon connection string went to the
 * screen, password and all, under a prompt that promised it would not. So this
 * takes the terminal out of cooked mode and reads the bytes itself: nothing is
 * echoed because nothing echoes it.
 */

const ESC = '';
/** A paste arrives wrapped in these when bracketed paste mode is on. */
const BRACKETED_PASTE = new RegExp(`${ESC}\\[20[01]~`, 'g');
const ESCAPE_SEQUENCE = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z~]`, 'g');

const ENTER = ['\r', '\n'];
const CTRL_C = '';
const CTRL_D = '';
const CTRL_U = '';
const BACKSPACE = ['', '\b'];

export async function hidden(prompt: string): Promise<string> {
  if (!stdin.isTTY) throw new Error('hidden() needs a terminal.');

  stdout.write(prompt);

  const wasRaw = Boolean(stdin.isRaw);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise<string>((resolve, reject) => {
    let value = '';

    const finish = (settle: () => void) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write('\n');
      settle();
    };

    const onData = (chunk: string) => {
      // Strip paste markers and any other escape sequence before looking at
      // characters, or "[200~" lands in the middle of the value.
      const text = chunk.replace(BRACKETED_PASTE, '').replace(ESCAPE_SEQUENCE, '');

      for (const ch of text) {
        if (ENTER.includes(ch)) return finish(() => resolve(value));
        if (ch === CTRL_C) return finish(() => reject(new Error('Cancelled.')));
        if (ch === CTRL_D && !value) return finish(() => reject(new Error('Cancelled.')));
        if (BACKSPACE.includes(ch)) {
          value = value.slice(0, -1);
          continue;
        }
        if (ch === CTRL_U) {
          value = '';
          continue;
        }
        if (ch < ' ') continue; // ignore every other control character
        value += ch;
      }
    };

    stdin.on('data', onData);
  });
}

/** Ordinary prompt, echoed — for things that are not secrets. */
export async function ask(prompt: string): Promise<string> {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}
