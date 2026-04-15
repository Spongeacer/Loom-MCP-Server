export interface LoomStatus {
  activeTask?: { id: string; title: string; current?: string };
  decisions: { id: string; title: string }[];
  risks: string[];
  fsHealth: string[];
}

export function parseStatus(stdout: string): LoomStatus {
  const result: LoomStatus = {
    decisions: [],
    risks: [],
    fsHealth: [],
  };

  const lines = stdout.split('\n');
  let section: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('<task ')) {
      section = 'task';
      const idMatch = line.match(/id="([^"]+)"/);
      result.activeTask = {
        id: idMatch?.[1] ?? 'unknown',
        title: '',
      };
      continue;
    }
    if (line.startsWith('<decisions>')) {
      section = 'decisions';
      continue;
    }
    if (line.startsWith('<risks>')) {
      section = 'risks';
      continue;
    }
    if (line.startsWith('<fs_health>')) {
      section = 'fs_health';
      continue;
    }
    if (line.startsWith('</')) {
      section = null;
      continue;
    }

    if (section === 'task') {
      if (line.startsWith('Goal:')) {
        result.activeTask!.title = line.replace('Goal:', '').trim();
      } else if (line.startsWith('Current:')) {
        result.activeTask!.current = line.replace('Current:', '').trim();
      }
    } else if (section === 'decisions' && line.startsWith('↣')) {
      const m = line.match(/↣([^:]+):\s*(.+)/);
      if (m) {
        result.decisions.push({ id: m[1], title: m[2] });
      }
    } else if (section === 'risks') {
      result.risks.push(line);
    } else if (section === 'fs_health') {
      result.fsHealth.push(line);
    }
  }

  return result;
}
