// notes-utils.js
// Utilitaires partagés (index.html + notations.html) pour calculer les notes
// moyennes par jeu à partir de history.json + /reviews, sans base de données
// dédiée : on croise juste les deux sources côté client.
//
// Hypothèse : le champ "Jeu" de chaque ligne de history.json[].summary
// correspond EXACTEMENT au champ "name" de gameList.json. Si un nouveau nom
// ne correspond pas, il sera simplement traité comme un jeu à part (regroupé
// sous son propre nom), sans faire planter le reste.

/**
 * Construit une Map : nomDuJeu -> { count, sum, avg, entries: [...] }
 * entries[] = { sessionId, date, player, playerUrl, objectif, rating, comment }
 *
 * @param {Array} history  contenu de history.json
 * @param {Array} reviews  contenu retourné par GET /reviews
 */
function ntBuildGameStats(history, reviews) {
  const stats = new Map();

  function getBucket(name) {
    if (!stats.has(name)) {
      stats.set(name, { count: 0, sum: 0, avg: 0, entries: [] });
    }
    return stats.get(name);
  }

  (history || []).forEach(session => {
    (session.summary || []).forEach(row => {
      const jeu = row && row['Jeu'];
      if (!jeu) return;

      const review = (reviews || []).find(r =>
        Number(r.sessionId) === Number(session.id) &&
        String(r.player).trim().toLowerCase() === String(row.player).trim().toLowerCase()
      );

      const bucket = getBucket(jeu);
      bucket.entries.push({
        sessionId: session.id,
        date: session.date,
        player: row.player,
        playerUrl: row.playerUrl || '',
        objectif: row['Objectif'] || '',
        rating: review ? Number(review.rating) || 0 : 0,
        comment: review ? (review.comment || '') : ''
      });

      if (review && Number(review.rating) > 0) {
        bucket.count += 1;
        bucket.sum += Number(review.rating);
      }
    });
  });

  stats.forEach(bucket => {
    bucket.avg = bucket.count ? bucket.sum / bucket.count : 0;
  });

  return stats;
}

/** Chaîne d'étoiles pleines/vides sur 5 (arrondi au plus proche). */
function ntStarString(avg) {
  const rounded = Math.max(0, Math.min(5, Math.round(avg)));
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

/**
 * Rendu HTML d'étoiles sur 5 supportant les valeurs fractionnaires (demi-étoiles, etc.)
 * via une superposition : 5 étoiles vides en fond, 5 étoiles pleines recouvertes
 * en largeur proportionnelle à la note. Reste sur une seule ligne, taille = font-size ambiant.
 */
function ntStarsHtml(value) {
  const pct = Math.round(Math.max(0, Math.min(100, (Number(value) || 0) / 5 * 100)) * 10) / 10;
  return (
    '<span class="star-rating-display">' +
      '<span class="star-bg" aria-hidden="true">★★★★★</span>' +
      `<span class="star-fg" aria-hidden="true" style="width:${pct}%">★★★★★</span>` +
    '</span>'
  );
}
