import { EMPTY_RATING, summarize, toRatingMap } from './rating.util';

describe('summarize', () => {
  // Membedakan "belum dinilai" dari "dinilai nol" penting untuk UI.
  it('mengembalikan null bila belum ada ulasan', () => {
    expect(summarize(null, 0)).toEqual(EMPTY_RATING);
    expect(summarize(undefined, 0)).toEqual(EMPTY_RATING);
    expect(summarize(4.5, 0)).toEqual(EMPTY_RATING);
  });

  it('membulatkan ke satu angka desimal', () => {
    expect(summarize(4.833333, 6)).toEqual({ average: 4.8, count: 6 });
    expect(summarize(4.25, 4)).toEqual({ average: 4.3, count: 4 });
    expect(summarize(5, 2)).toEqual({ average: 5, count: 2 });
  });
});

describe('toRatingMap', () => {
  it('memetakan id ke ringkasan ratingnya', () => {
    const map = toRatingMap(
      [
        { koperasiId: 'a', _avg: { rating: 4.5 }, _count: { rating: 2 } },
        { koperasiId: 'b', _avg: { rating: 3.0 }, _count: { rating: 1 } },
      ],
      'koperasiId',
    );

    expect(map.get('a')).toEqual({ average: 4.5, count: 2 });
    expect(map.get('b')).toEqual({ average: 3, count: 1 });
    expect(map.get('tidak-ada')).toBeUndefined();
  });

  it('melewati baris dengan id null', () => {
    const map = toRatingMap(
      [{ koperasiId: null, _avg: { rating: 5 }, _count: { rating: 1 } }],
      'koperasiId',
    );
    expect(map.size).toBe(0);
  });
});
