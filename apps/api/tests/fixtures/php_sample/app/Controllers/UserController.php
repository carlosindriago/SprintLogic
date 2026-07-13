<?php
namespace App\Controllers;

use App\Models\User as ClientUser;
use GuzzleHttp\Client;

class UserController extends BaseController {
    public function create() {
        $user = new ClientUser();
        $date = new \DateTime(); 
        ClientUser::find(); 
        $client = new Client(); 
    }
}
