import { Position } from './types';

export const getExitCount = (map: number[][]): number => {
  let count = 0;
  for(let y=0; y<map.length; y++) {
    for(let x=0; x<map[0].length; x++) {
      if(map[y][x] === 3) count++;
    }
  }
  return count;
};

export const calculatePaths = (map: number[][]) => {
  const rows = map.length;
  const cols = map[0].length;
  const starts: Position[] = [];
  const exits: Position[] = [];
  
  // Find all starts (red gates) and exits (blue gates)
  for(let y=0; y<rows; y++) {
    for(let x=0; x<cols; x++) {
      if(map[y][x] === 2) starts.push({x, y});
      if(map[y][x] === 3) exits.push({x, y});
    }
  }

  const calculatedPaths: Position[][] = [];
  
  // Calculate path from each start to each exit
  starts.forEach(start => {
    exits.forEach(exit => {
      const path = findPathBFS(map, start, exit, rows, cols);
      if (path.length > 0) {
        calculatedPaths.push(path);
      }
    });
    
    // If no exits exist, try to find any path to a blue gate (fallback)
    if (exits.length === 0) {
      const path = findPathToAnyExit(map, start, rows, cols);
      if (path.length > 0) {
        calculatedPaths.push(path);
      }
    }
  });
  
  return calculatedPaths;
};

// BFS to find path from start to specific exit
function findPathBFS(map: number[][], start: Position, exit: Position, rows: number, cols: number): Position[] {
  const q: {pos: Position, path: Position[]}[] = [{ pos: start, path: [start] }];
  const visited = new Set<string>();
  visited.add(`${start.x},${start.y}`);
  
  while(q.length > 0) {
    const { pos, path } = q.shift()!;
    
    // Check if we reached the target exit
    if (pos.x === exit.x && pos.y === exit.y) {
      return path;
    }
    
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for(const [dx, dy] of dirs) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && 
          (map[ny][nx] === 1 || map[ny][nx] === 3 || map[ny][nx] === 2) && 
          !visited.has(`${nx},${ny}`)) {
        visited.add(`${nx},${ny}`);
        q.push({ pos: {x: nx, y: ny}, path: [...path, {x: nx, y: ny}] });
      }
    }
  }
  
  return []; // No path found
}

// Fallback: find path to any exit (original behavior)
function findPathToAnyExit(map: number[][], start: Position, rows: number, cols: number): Position[] {
  const q: {pos: Position, path: Position[]}[] = [{ pos: start, path: [start] }];
  const visited = new Set<string>();
  visited.add(`${start.x},${start.y}`);
  
  while(q.length > 0) {
    const { pos, path } = q.shift()!;
    if (map[pos.y][pos.x] === 3) {
      return path;
    }
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for(const [dx, dy] of dirs) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && 
          (map[ny][nx] === 1 || map[ny][nx] === 3 || map[ny][nx] === 2) && 
          !visited.has(`${nx},${ny}`)) {
        visited.add(`${nx},${ny}`);
        q.push({ pos: {x: nx, y: ny}, path: [...path, {x: nx, y: ny}] });
      }
    }
  }
  
  return [];
}



