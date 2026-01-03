import { TwitterApi } from 'twitter-api-v2';
import { config } from '../config';
import { PlatformClientError } from '../errors';
import { log } from '../logger';

let twitterClient: TwitterApi | null = null;

export function getTwitterClient(): TwitterApi {
  if (twitterClient) {
    return twitterClient;
  }

  try {
    if (config.twitterBearerToken) {
      twitterClient = new TwitterApi(config.twitterBearerToken);
    } else if (config.twitterClientId && config.twitterClientSecret) {
      twitterClient = new TwitterApi({
        clientId: config.twitterClientId,
        clientSecret: config.twitterClientSecret,
      });
    } else {
      throw new PlatformClientError(
        'Twitter credentials required: TWITTER_BEARER_TOKEN or TWITTER_CLIENT_ID+TWITTER_CLIENT_SECRET',
        'TWITTER',
        false
      );
    }

    log.info({ platform: 'TWITTER' }, 'Twitter client initialized');
    return twitterClient;
  } catch (error) {
    log.error({ error, platform: 'TWITTER' }, 'Failed to initialize Twitter client');
    throw error;
  }
}

export function getTwitterReadOnlyClient(): TwitterApi['readOnly'] {
  return getTwitterClient().readOnly;
}
