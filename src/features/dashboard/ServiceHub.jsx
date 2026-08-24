import { useEffect, useState } from 'react';

import { getSafeExternalUrl, requestJson } from '../../api/client.js';
import LoadingProgress from '../../components/LoadingProgress.jsx';
import BookmarksManager from '../bookmarks/BookmarksManager.jsx';

export default function ServiceHub({ initialTab = 'services' }) {
  const [tab, setTab] = useState(initialTab);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    requestJson('/api/services', { signal: controller.signal })
      .then((result) => setServices((result.services ?? []).filter((service) => getSafeExternalUrl(service.url))))
      .catch((nextError) => {
        if (nextError.name !== 'AbortError') setError(nextError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="service-hub">
      <div className="service-hub-tabs" role="tablist" aria-label="SEONOLOGY 콘텐츠">
        <button type="button" role="tab" aria-selected={tab === 'services'} onClick={() => setTab('services')}>Services</button>
        <button type="button" role="tab" aria-selected={tab === 'bookmarks'} onClick={() => setTab('bookmarks')}>Bookmarks</button>
      </div>
      {tab === 'services' && (
        <div className="split-service-grid" role="tabpanel" data-capability="services">
          {loading && <LoadingProgress label="서비스를 불러오는 중입니다." detail="등록된 서비스 목록을 확인하고 있습니다." compact />}
          {error && <p role="alert">{error}</p>}
          {!loading && !error && services.length === 0 && <p>표시할 서비스가 없습니다.</p>}
          {services.map((service) => (
            <a key={service.id} href={getSafeExternalUrl(service.url)} target="_blank" rel="noopener noreferrer" style={{ '--service-color': service.color }}>
              <b>{service.name}</b><span>{service.description}</span>
            </a>
          ))}
        </div>
      )}
      {tab === 'bookmarks' && <div role="tabpanel"><BookmarksManager /></div>}
    </div>
  );
}
