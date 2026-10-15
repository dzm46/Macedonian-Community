import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

function envOverridesNodesFile() {
    return Boolean(process.env.LAVALINK_NODES?.trim() || process.env.LAVALINK_HOST?.trim());
}

function parseNodesFromEnv() {
    const raw = process.env.LAVALINK_NODES?.trim();
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        const nodes = parseNodesPayload(parsed);
        if (!nodes?.length) {
            logger.warn('LAVALINK_NODES is set but did not parse to a non-empty node list');
            return null;
        }
        return nodes;
    } catch (error) {
        logger.warn(`LAVALINK_NODES is set but invalid JSON: ${error.message}`);
        return null;
    }
}

function buildSingleNodeFromEnv() {
    const host = process.env.LAVALINK_HOST?.trim();
    if (!host) {
        return null;
    }

    return [{
        host,
        port: Number(process.env.LAVALINK_PORT || 2333),
        password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        secure: parseBoolean(process.env.LAVALINK_SECURE, false),
        name: process.env.LAVALINK_NAME || 'Main',
    }];
}

function parseNodesPayload(parsed) {
    if (Array.isArray(parsed)) {
        return parsed;
    }
    if (Array.isArray(parsed?.nodes)) {
        return parsed.nodes;
    }
    return null;
}

function loadNodesFromFile() {
    if (envOverridesNodesFile()) {
        return null;
    }

    if (process.env.LAVALINK_NODES_FILE === '') {
        return null;
    }

    const nodesFile = process.env.LAVALINK_NODES_FILE?.trim()
        || path.join(projectRoot, 'lavalink', 'nodes.json');

    if (!existsSync(nodesFile)) {
        return null;
    }

    try {
        const parsed = JSON.parse(readFileSync(nodesFile, 'utf8'));
        return parseNodesPayload(parsed);
    } catch {
        return null;
    }
}

export function getLavalinkNodes() {
    const fromJson = parseNodesFromEnv();
    if (fromJson?.length) {
        return fromJson;
    }

    const singleFromEnv = buildSingleNodeFromEnv();
    if (singleFromEnv) {
        return singleFromEnv;
    }

    const fromFile = loadNodesFromFile();
    if (fromFile?.length) {
        return fromFile;
    }

    return [{
        host: 'localhost',
        port: 2333,
        password: 'youshallnotpass',
        secure: false,
        name: 'Main',
    }];
}

export const lavalinkConfig = {
    nodes: getLavalinkNodes(),
    defaultSearchPlatform: process.env.LAVALINK_SEARCH_PLATFORM || 'ytmsearch',
    restVersion: process.env.LAVALINK_REST_VERSION || 'v4',
};

export default lavalinkConfig;
