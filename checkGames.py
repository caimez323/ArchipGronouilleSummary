import json
import re

pattern = r"Games [A-Za-z]+-[A-Za-z]+"

with open("public/gameList.json", "r", encoding="utf-8") as file:
    data = json.load(file)
games = [e["name"] for e in data]

with open("gameNameCheck.txt", "r", encoding="utf-8") as file:
    gameCheck = file.readlines()

#On split pour séparer le channel discord et la plateforme de jeu (entre parenthèses, et je remet si jamais y en avait)
linesCheck = [("(".join((line.split("\u2060")[0][:-2]).split("(")[:-1]))[:-1] for line in gameCheck]
#Ensuite on met un espace entre les points parce que j'en met
linesCheck = [line.replace(": "," : ") for line in linesCheck]
#On retire les intercalaires (pas besoin déjà suppr au dessus)
#linesCheck = [re.sub(pattern, '', line) for line in linesCheck]
linesCheck = [line for line in linesCheck if line.strip() != ""]

remaining = [rem for rem in linesCheck if rem not in games]
print("Liste des jeux qui sont dans Check mais pas dans gameList.json :")#Donc les jeux nouveaux manquants
print(remaining)