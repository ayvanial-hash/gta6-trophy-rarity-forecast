import * as fs from 'fs';
import * as path from 'path';

const BASE_TIME = new Date('2026-11-19T00:00:00Z').getTime();
const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR || '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function logit(p: number): number {
    const clamped = Math.max(0.0001, Math.min(0.9999, p));
    return Math.log(clamped / (1 - clamped));
}

function invLogit(l: number): number {
    return 100 / (1 + Math.exp(-l));
}

function processFiles() {
    if (!fs.existsSync(INPUT_DIR)) return;
    const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.in')).sort();

    for (const file of files) {
        const inputPath = path.join(INPUT_DIR, file);
        const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
        const { id, target, horizon_minutes, trophies, history } = data;
        const targetTime = new Date(target).getTime();
        const targetT = (targetTime - BASE_TIME) / (1000 * 60 * 60);

        const outputTrophies = trophies.map((tId: any) => {
            const series: { t: number, l: number }[] = [];
            for (const entry of history) {
                const idx = trophies.indexOf(tId);
                const rate = entry.rates[idx];
                if (rate !== null) {
                    const time = new Date(entry.at).getTime();
                    const t = (time - BASE_TIME) / (1000 * 60 * 60);
                    series.push({ t, l: logit(rate / 100) });
                }
            }

            const points = series.slice(-48);
            let lt: number;
            let s: number;

            if (points.length < 3) {
                lt = points.length > 0 ? points[points.length - 1].l : 0;
                s = 0.35 * Math.sqrt(horizon_minutes / 1440);
            } else {
                const X = points.map(p => Math.log(1 + Math.max(0, p.t)));
                const Y = points.map(p => p.l);
                const n = X.length;
                const sumX = X.reduce((a, b) => a + b, 0);
                const sumY = Y.reduce((a, b) => a + b, 0);
                const sumXX = X.reduce((a, b) => a + b * b, 0);
                const sumXY = X.reduce((a, b, i) => a + b * Y[i], 0);

                const denom = n * sumXX - sumX * sumX;
                const b_fit = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
                const a_fit = denom === 0 ? sumY / n : (sumY - b_fit * sumX) / n;

                if (!Number.isFinite(b_fit)) {
                    lt = points[points.length - 1].l;
                    s = 0.35 * Math.sqrt(horizon_minutes / 1440);
                } else {
                    lt = a_fit + b_fit * Math.log(1 + Math.max(0, targetT));
                    const residuals = points.map((p, i) => p.l - (a_fit + b_fit * X[i]));
                    const s_res = Math.max(0.12, Math.sqrt(residuals.reduce((a, b) => a + b * b, 0) / n));
                    s = Math.sqrt(s_res * s_res + Math.pow(0.35 * Math.sqrt(horizon_minutes / 1440), 2));
                }
            }

            const l_last = points.length > 0 ? points[points.length - 1].l : 0;
            lt = Math.max(lt, l_last - 0.05);

            const z = [-1.645, -0.674, 0, 0.674, 1.645];
            const q = z.map(zv => Math.min(100, Math.max(0, invLogit(lt + zv * s)))).sort((a, b) => a - b);
            
            return { id: tId.id, q: q.map(v => Math.round(v * 10000) / 10000) };
        });

        fs.writeFileSync(path.join(OUTPUT_DIR, `${id}.out`), JSON.stringify({ trophies: outputTrophies }));
        console.error(`Processed ${file}`);
    }
}

processFiles();
console.log('DONE');
