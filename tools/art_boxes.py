"""Crop boxes (x0, y0, x1, y1) in the reference mockups' own pixels (2400x1792) for tools/cut_sprites.py."""
JOBS = {
    'start':   ('title', (640, 1290, 1760, 1720)),   # START GAME button
    'match':   ('title', (1700, 930, 2080, 1080)),   # "match!" tag
    'tin':     ('title', (1440, 540, 2010, 1004)),   # the pink EYE CATCH card tin + its lid (right of the tutor)
    'avatar1': ('game', (100, 110, 320, 330)),       # player 1 face (blue plate)
    'avatar2': ('game', (2080, 105, 2300, 330)),     # player 2 face (orange plate)
}
