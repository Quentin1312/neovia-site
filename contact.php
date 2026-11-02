<?php
// Reçoit le formulaire de contact et l'envoie par e-mail.
header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex');

function reply($code, $ok, $message = '') {
    http_response_code($code);
    echo json_encode(array('success' => $ok, 'message' => $message));
    exit;
}

function field($data, $key, $max) {
    $v = isset($data[$key]) && is_scalar($data[$key]) ? trim((string) $data[$key]) : '';
    return mb_substr($v, 0, $max, 'UTF-8');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(405, false, 'Méthode non autorisée');
}

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if ($origin !== 'https://neoviaweb.fr') {
    reply(403, false, 'Origine non autorisée');
}

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    reply(400, false, 'Requête invalide');
}

// Champ invisible : seul un robot le remplit. On répond comme si tout allait bien.
if (field($data, '_site', 200) !== '') {
    reply(200, true);
}

$nom = str_replace(array("\r", "\n"), ' ', field($data, 'nom', 120));
$tel = str_replace(array("\r", "\n"), ' ', field($data, 'tel', 40));
if ($nom === '' || $tel === '') {
    reply(422, false, 'Nom et téléphone requis');
}

// 5 demandes par heure au maximum depuis une même adresse
$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
$stamp = sys_get_temp_dir() . '/neovia_contact_' . sha1($ip);
$recent = array();
if (is_file($stamp)) {
    foreach (explode("\n", (string) file_get_contents($stamp)) as $t) {
        if ((int) $t > time() - 3600) {
            $recent[] = (int) $t;
        }
    }
}
if (count($recent) >= 5) {
    reply(429, false, 'Trop de demandes');
}
$recent[] = time();
file_put_contents($stamp, implode("\n", $recent), LOCK_EX);

$lines = array(
    'Nom : ' . $nom,
    'Téléphone : ' . $tel,
    'Commune : ' . field($data, 'ville', 120),
    'Activité : ' . field($data, 'activite', 200),
    'Site existant : ' . field($data, 'site', 200),
    'Besoins : ' . field($data, 'besoins', 500),
    'Délai : ' . field($data, 'delai', 200),
    '',
    'Message :',
    field($data, 'message', 4000),
);

$subject = mb_encode_mimeheader('Nouvelle demande Neovia — ' . $nom, 'UTF-8', 'B');
$headers = "From: Site Neovia <contact@neoviaweb.fr>\r\n"
    . "MIME-Version: 1.0\r\n"
    . "Content-Type: text/plain; charset=UTF-8\r\n"
    . "Content-Transfer-Encoding: 8bit\r\n";

if (!mail('quentincarriere1312@gmail.com', $subject, implode("\n", $lines), $headers, '-fcontact@neoviaweb.fr')) {
    reply(500, false, 'Envoi impossible');
}
reply(200, true);
