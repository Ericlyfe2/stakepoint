import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function TicketPage() {
  const { code } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!code) {
      navigate('/', { replace: true });
      return;
    }
    const upper = code.toUpperCase();
    try {
      sessionStorage.setItem('sp_ticket_code', upper);
    } catch { /* ignore */ }
    navigate('/', { replace: true });
  }, [code, navigate]);

  return null;
}
