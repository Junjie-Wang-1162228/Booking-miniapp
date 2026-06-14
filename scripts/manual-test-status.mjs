import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_CHECKLIST_PATH = 'docs/manual-test-checklist.md';

function percent(completed, total) {
  if (total <= 0) return 100;
  return Math.round((completed / total) * 100);
}

function createEmptySection(title) {
  return {
    title,
    completed: 0,
    total: 0,
    percent: 100,
    tasks: []
  };
}

export function parseManualChecklist(source, checklistPath = DEFAULT_CHECKLIST_PATH) {
  const sections = [];
  let currentSection = createEmptySection('未分组');
  const tasks = [];

  for (const [index, line] of source.split('\n').entries()) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      currentSection = createEmptySection(headingMatch[1]);
      sections.push(currentSection);
      continue;
    }

    const taskMatch = line.match(/^-\s+\[(x|X| )\]\s+(.+?)\s*$/);
    if (!taskMatch) continue;

    if (!sections.includes(currentSection)) sections.push(currentSection);

    const task = {
      section: currentSection.title,
      line: index + 1,
      text: taskMatch[2],
      completed: taskMatch[1].toLowerCase() === 'x'
    };

    tasks.push(task);
    currentSection.tasks.push(task);
    currentSection.total += 1;
    if (task.completed) currentSection.completed += 1;
  }

  for (const section of sections) {
    section.percent = percent(section.completed, section.total);
  }

  const completed = tasks.filter((task) => task.completed).length;
  const total = tasks.length;
  const next = tasks.find((task) => !task.completed) ?? null;

  return {
    mode: 'manual-test-status',
    checklistPath,
    opensDevTools: false,
    completed,
    total,
    percent: percent(completed, total),
    complete: total > 0 && completed === total,
    next: next
      ? {
          section: next.section,
          line: next.line,
          text: next.text
        }
      : null,
    sections: sections.map((section) => {
      const sectionNext = section.tasks.find((task) => !task.completed) ?? null;

      return {
        title: section.title,
        completed: section.completed,
        total: section.total,
        percent: section.percent,
        next: sectionNext
          ? {
              section: sectionNext.section,
              line: sectionNext.line,
              text: sectionNext.text
            }
          : null
      };
    })
  };
}

export function createManualTestStatus(checklistPath = DEFAULT_CHECKLIST_PATH) {
  return parseManualChecklist(readFileSync(checklistPath, 'utf8'), checklistPath);
}

function main() {
  const status = createManualTestStatus();
  console.log(JSON.stringify(status, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
