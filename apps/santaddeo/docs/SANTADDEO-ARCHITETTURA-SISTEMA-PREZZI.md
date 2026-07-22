# Santaddeo - Architettura Sistema Prezzi

## 1. Doppia modalita'
Il sistema deve supportare due modalita':
- **Algoritmo Base** (occupazione-driven)
- **Algoritmo Avanzato** (K-driven parametrico)

## 2. Algoritmo Avanzato
L'algoritmo avanzato:
- utilizza un coefficiente K giornaliero
- puo' operare in modalita' Master-rate o per-tipologia
- consente override manuale del prezzo iniziale

## 3. K influenza
- il prezzo di partenza (se non in override)
- la curvatura della funzione di crescita prezzo

## 4. Ogni prezzo deve essere
- derivato da dati reali
- tracciabile
- spiegabile

## 5. Vincoli di sicurezza
Devono esistere vincoli di sicurezza per evitare oscillazioni distruttive.
