# Blokada czatu Twitch

Rozszerzenie Manifest V3 dla Chrome i Brave. Lista działa lokalnie: wyszarza przycisk czatu i zatrzymuje kliknięcie oraz Enter, jeśli wiadomość zawiera wybrany fragment. Nie kasuje tekstu.

## Instalacja w Brave

1. Otwórz `brave://extensions` i włącz **Tryb programisty**.
2. Kliknij **Załaduj rozpakowane** i wybierz katalog `extension` z tego projektu.
3. Odśwież otwarte karty Twitcha. Po każdej aktualizacji plików kliknij też przycisk przeładowania rozszerzenia.
4. Przypnij rozszerzenie na pasku. Kliknięcie ikony otwiera edytor listy. Zmiany wymagają **Zapisz listę**, potem działają bez przeładowywania kart.

W Chrome użyj `chrome://extensions`. Do korzystania z rozszerzenia nie potrzeba Node, npm ani serwera.

## Dopasowanie

Lista startowa PL/EN jest osobistą listą ostrożności, **nie oficjalną listą Twitcha** i nie gwarantuje uniknięcia bana. Krótkie rdzenie łapią wiele odmian, ale nie zapewniają pełnej analizy języka. Można usuwać i dopisywać wpisy, jeden na wiersz. Lista startowa zawiera obraźliwe określenia, widoczne w ustawieniach. Zwykłe przekleństwa nie są dodawane automatycznie.

Wyszukiwanie obejmuje fragmenty słów i nazwy emotek. Ignoruje wielkość liter, diakrytykę (w tym ł), spacje, interpunkcję, symbole i niewidoczne znaki. Sprawdza też zamiany `0→o, 1→i, 3→e, 4→a, 5→s, 7→t, 8→b, 9→g`. Normalizacja dotyczy również wpisów listy. Nie rozpoznaje wszystkich podobnych znaków innych alfabetów.

Tak szeroka reguła celowo daje fałszywe alarmy, również na granicy sąsiednich słów. Jeśli przeszkadzają, usuń zbyt krótki wpis. Pusta lista jest dozwolona i niczego nie blokuje. „Lista startowa” przygotowuje zmianę, a „Zapisz listę” ją zatwierdza.

## Zakres i prywatność

Zwykły czat kanału i czat popout na `https://www.twitch.tv` oraz `https://twitch.tv`. Bez prywatnych wiadomości i panelu moderatora. Wtyczka przechwytuje interakcje z interfejsem Twitcha; inne rozszerzenia wysyłające wiadomości bezpośrednio przez API są poza jej zakresem. Zmiana interfejsu Twitcha może wymagać aktualizacji selektorów.

Jedynym uprawnieniem jest `storage`; skrypty działają tylko na wymienionych adresach Twitcha. Lista jest w `chrome.storage.local`, bez synchronizacji do chmury. Wiadomości są sprawdzane w pamięci i nie są zapisywane ani wysyłane przez rozszerzenie. Brak telemetrii, konta i zewnętrznych bibliotek w rozszerzeniu. Do czasu odczytu konfiguracji i przy błędzie jej odczytu wysyłanie jest zatrzymane.

## Testy

```sh
npm ci
npm test
npm run test:browser
```

Testy przeglądarkowe uruchamiają osobny, tymczasowy profil Brave (`/usr/bin/brave-browser`). Można wskazać inny plik przez `BRAVE_PATH`. Testy kierują adres Twitcha na lokalną makietę przez routing Playwright, więc żadna wiadomość nie trafia na prawdziwy czat. Dane testowe są neutralne. Testy błędów odczytu używają kontrolowanej atrapy API storage. Nie zmieniają Twojego profilu Brave.

Ręczna kontrola na Twitchu: tymczasowo zapisz neutralny wpis `mak`, wpisz `MA.K` i sprawdź wyszarzenie oraz komunikat; następnie usuń szkic bez wysyłania i przywróć własną listę. Próby kliknięcia/Entera wykonuj na makiecie testowej.

Opcjonalnie `npm run test:live` sprawdza prawdziwą stronę Twitcha w tymczasowym profilu, wpisując wyłącznie neutralne teksty bez klikania wysyłania i bez Entera. Sprawdza zwykły czat i popout. Wymaga dostępu do internetu. `HEADED=1` pokazuje okno testowej przeglądarki.
